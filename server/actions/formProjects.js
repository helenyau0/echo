import Promise from 'bluebird'
import {getCycleById} from 'src/server/db/cycle'
import {findPlayersByIds} from 'src/server/db/player'
import {findVotesForCycle} from 'src/server/db/vote'
import {insertProjects, findProjects} from 'src/server/db/project'
import {toArray, mapById, sum} from 'src/server/util'
import {flatten} from 'src/common/util'
import logger from 'src/server/util/logger'
import {getTeamFormationPlan} from 'src/server/services/projectFormationService'
import getLatestFeedbackStats from 'src/server/actions/getLatestFeedbackStats'
import generateProject from 'src/server/actions/generateProject'

export async function formProjectsIfNoneExist(cycleId) {
  const projectsCount = await findProjects({cycleId}).count()
  if (projectsCount > 0) {
    return
  }
  return formProjects(cycleId)
}

export async function formProjects(cycleId) {
  const projects = await buildProjects(cycleId)
  return insertProjects(projects)
}

export async function buildProjects(cycleId) {
  const cycle = await getCycleById(cycleId)

  // => {goals, votes, cycleId}
  const votingPool = await _buildVotingPool(cycleId)

  // => [
  //   {seatCount, teams: [{playerIds, goalDescriptor, teamSize}]},
  //   {seatCount, teams: [{playerIds, goalDescriptor, teamSize}]},
  // ]
  const pools = await _splitPool(votingPool)
  const plans = pools.map(getTeamFormationPlan)
  const teamFormationPlan = _mergePlans(plans)

  return _teamFormationPlanToProjects(cycle, votingPool, teamFormationPlan)
}

async function _splitPool(pool) {
  const pools = [{}, {}, {}]

  const voteCount = pool.votes.length
  const votesPerPool = Math.ceil(voteCount / 3)
  const votesSortedByElo = await _sortVotesByElo(pool.votes)
  pools[0].votes = votesSortedByElo.slice(0, votesPerPool)
  pools[1].votes = votesSortedByElo.slice(votesPerPool, votesPerPool * 2)
  pools[2].votes = votesSortedByElo.slice(votesPerPool * 2)

  pools.forEach((p, i) => {
    const poolGoalDescriptors = p.votes.reduce((result, vote) => {
      vote.votes.forEach(goal => result.add(goal))
      return result
    }, new Set())
    p.goals = pool.goals.filter(_ => poolGoalDescriptors.has(_.goalDescriptor))

    const poolPlayers = p.votes.reduce((result, vote) => {
      result.add(vote.playerId)
      return result
    }, new Set())
    logger.log(`Pool ${i}:`, poolPlayers)

    p.playerFeedback = pool.playerFeedback
  })

  return pools
}

async function _sortVotesByElo(votes) {
  const players = await findPlayersByIds(votes.map(_ => _.playerId))
  const playersById = mapById(players)
  const getElo = vote => _playerElo(playersById.get(vote.playerId))
  return votes.slice().sort((a, b) => getElo(a) - getElo(b))
}

function _mergePlans(plans) {
  const result = {
    seatCount: sum(plans.map(_ => _.seatCount)),
    teams: flatten(plans.map(_ => _.teams)),
    score: plans.map(_ => _.score),
  }

  return result
}

function _teamFormationPlanToProjects(cycle, pool, teamFormationPlan) {
  const goals = pool.goals.reduce((result, goal) => {
    result.set(goal.goalDescriptor, goal)
    return result
  }, new Map())

  return Promise.all(
    teamFormationPlan.teams.map(team =>
      generateProject({
        chapterId: cycle.chapterId,
        cycleId: cycle.id,
        goal: goals.get(team.goalDescriptor),
        playerIds: team.playerIds,
      })
    )
  )
}

async function _buildVotingPool(cycleId) {
  const cycleVotes = await findVotesForCycle(cycleId).run()
  if (!cycleVotes.length) {
    throw new Error('No votes submitted for cycle')
  }

  const players = await _getPlayersWhoVoted(cycleVotes)

  const votes = cycleVotes.map(({goals, playerId}) => ({playerId, votes: goals.map(({url}) => url)}))
  const goalsByUrl = _extractGoalsFromVotes(cycleVotes)
  const goals = toArray(goalsByUrl).map(goal => ({goalDescriptor: goal.url, ...goal}))
  const playerFeedback = await _getPlayerFeedback([...players.keys()])

  return {goals, votes, cycleId, playerFeedback}
}

async function _getPlayerFeedback(playerIds) {
  const pairings = flatten(playerIds.map(respondentId => {
    const teammates = playerIds.filter(id => id !== respondentId)
    return teammates.map(subjectId => ({respondentId, subjectId}))
  }))

  const feedbackTuples = await Promise.map(
    pairings,
    pair => getLatestFeedbackStats(pair).then(stats => ({...pair, stats})),
    {concurrency: 20}
  )

  const feedback = feedbackTuples.reduce((result, {respondentId, subjectId, stats}) => {
    result.respondentIds[respondentId] = result.respondentIds[respondentId] || {subjectIds: {}}
    result.respondentIds[respondentId].subjectIds[subjectId] = stats
    return result
  }, {respondentIds: {}})

  return feedback
}

async function _getPlayersWhoVoted(cycleVotes) {
  const playerVotes = _mapVotesByPlayerId(cycleVotes)
  const votingPlayerIds = Array.from(playerVotes.keys())
  const votingPlayers = await findPlayersByIds(votingPlayerIds).run()
  return mapById(votingPlayers)
}

function _extractGoalsFromVotes(votes) {
  votes = toArray(votes)
  return votes.reduce((result, vote) => {
    if (Array.isArray(vote.goals)) {
      vote.goals.forEach(goal => {
        if (goal.url && !result.has(goal.url)) {
          result.set(goal.url, goal)
        }
      })
    }
    return result
  }, new Map())
}

function _mapVotesByPlayerId(votes) {
  votes = toArray(votes)
  return votes.reduce((result, vote) => {
    result.set(vote.playerId, {
      goals: Array.isArray(vote.goals) ? vote.goals.slice(0) : []
    })
    return result
  }, new Map())
}

function _playerElo(player) {
  return parseInt(((player.stats || {}).elo || {}).rating, 10) || 0
}
