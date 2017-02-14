import csvWriter from 'csv-write-stream'

import config from 'src/config'
import graphQLFetcher from 'src/server/util/graphql'
import {Player} from 'src/server/services/dataService'
import {mapById} from 'src/server/util'

const NO_LEVEL = 'N/A'

export default function requestHandler(req, res) {
  const {chapter} = req.query
  const writer = csvWriter()
  writer.pipe(res)

  return runReport(writer, chapter)
    .then(() => writer.end())
}

async function runReport(writer) {
  const playerLevelGroups = (await Player.group(row => row('stats')('level')))
    .reduce((result, group) => {
      const {group: level, reduction: players} = group
      result.set(level === null ? NO_LEVEL : level, players)
      return result
    }, new Map())

  const activePlayerLevelGroups = await removeInactivePlayers(playerLevelGroups)
  for (const [level, players] of activePlayerLevelGroups.entries()) {
    if (level !== NO_LEVEL) {
      writer.write({level, count: players.length})
    }
  }
}

async function removeInactivePlayers(playerLevelGroups) {
  const playerLevelGroupEntries = Array.from(playerLevelGroups.entries())
  const playerIds = playerLevelGroupEntries.reduce((result, levelAndPlayers) => {
    result = result.concat(levelAndPlayers[1].map(_ => _.id))
    return result
  }, [])
  const usersById = mapById(await getActiveStatuses(playerIds))

  return playerLevelGroupEntries.reduce((result, [level, players]) => {
    const activePlayers = players.filter(_ => usersById.get(_.id).active)
    result.set(level, activePlayers)
    return result
  }, new Map())
}

function getActiveStatuses(playerIds) {
  return graphQLFetcher(config.server.idm.baseURL)({
    query: 'query ($ids: [ID]!) { getActiveStatuses(ids: $ids) { id active } }',
    variables: {ids: playerIds},
  }).then(result => result.data.getActiveStatuses)
}