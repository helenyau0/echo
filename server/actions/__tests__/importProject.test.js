
/* eslint-env mocha */
/* global expect testContext */
/* eslint-disable prefer-arrow-callback, no-unused-expressions, max-nested-callbacks */
import factory from 'src/test/factories'
import {resetDB, useFixture} from 'src/test/helpers'
import {expectArraysToContainTheSameElements} from 'src/test/helpers/expectations'

import importProject from '../importProject'

describe(testContext(__filename), function () {
  before(resetDB)

  before(async function () {
    this.chapter = await factory.create('chapter')
    this.cycle = await factory.create('cycle', {chapterId: this.chapter.id})
    this.phase = await factory.create('phase', {number: 1})
    this.players = await factory.createMany('player', {chapterId: this.chapter.id, phaseId: this.phase.id}, 3)
    this.users = this.players.map(_idmPropsForUser)
    this.goalNumber = 1
    this.importData = {
      chapterIdentifier: this.chapter.name,
      cycleIdentifier: this.cycle.cycleNumber,
      playerIdentifiers: this.players.map(p => p.id),
      goalIdentifier: this.goalNumber,
    }
  })

  beforeEach(function () {
    useFixture.nockClean()
    useFixture.nockIDMFindUsers(this.users)
    useFixture.nockGetGoalInfo(this.goalNumber)
  })

  describe('importProject()', function () {
    it('throws an error if chapterIdentifier is invalid', function () {
      const result = importProject({...this.importData, chapterIdentifier: 'fake.chapter.id'})
      return expect(result).to.eventually.be.rejectedWith(/Chapter not found/)
    })

    it('throws an error if cycleIdentifier is invalid', function () {
      const result = importProject({...this.importData, cycleIdentifier: 10101010})
      return expect(result).to.eventually.be.rejectedWith(/Cycle not found/)
    })

    it('throws an error if player identifiers list is not an array when importing a new project', function () {
      const result = importProject({...this.importData, playerIdentifiers: undefined})
      return expect(result).to.eventually.be.rejectedWith(/Must specify at least one project member/)
    })

    it('throws an error if a specified member is not in a phase', async function () {
      const noPhasePlayer = await factory.create('player')
      const playerIdentifiers = [...this.importData.playerIdentifiers, noPhasePlayer.id]

      useFixture.nockClean()
      useFixture.nockIDMFindUsers([...this.users, noPhasePlayer])
      useFixture.nockGetGoalInfo(this.goalNumber)

      const result = importProject({...this.importData, playerIdentifiers})
      return expect(result).to.eventually.be.rejectedWith(/All project members must be in a phase/)
    })

    it('throws an error if specified members are not in the same phase', async function () {
      const newPhase = await factory.create('phase')
      const noPhasePlayer = await factory.create('player', {phaseId: newPhase.id})
      const playerIdentifiers = [...this.importData.playerIdentifiers, noPhasePlayer.id]

      useFixture.nockClean()
      useFixture.nockIDMFindUsers([...this.users, noPhasePlayer])
      useFixture.nockGetGoalInfo(this.goalNumber)

      const result = importProject({...this.importData, playerIdentifiers})
      return expect(result).to.eventually.be.rejectedWith(/Project members must be in the same phase/)
    })

    it('throws an error if phase for members has a different goal number than the specified goal', function () {
      const newGoalNumber = 2

      useFixture.nockClean()
      useFixture.nockIDMFindUsers(this.users)
      useFixture.nockGetGoalInfo(newGoalNumber, undefined, {phase: newGoalNumber})

      const result = importProject({...this.importData, goalIdentifier: newGoalNumber})
      return expect(result).to.eventually.be.rejectedWith(/cannot be linked/)
    })

    it('creates a new project a projectIdentifier is not specified', async function () {
      useFixture.nockClean()
      useFixture.nockIDMFindUsers(this.users)
      useFixture.nockGetGoalInfo(this.goalNumber, {times: 3})

      const importedProject = await importProject(this.importData)

      expect(importedProject.goal.goalMetadata.goal_id).to.eq(this.goalNumber) // eslint-disable-line camelcase
      expect(importedProject.chapterId).to.eq(this.chapter.id)
      expect(importedProject.cycleId).to.eq(this.cycle.id)
      expectArraysToContainTheSameElements(importedProject.playerIds, this.players.map(p => p.id))
    })

    it('creates a new project with specified projectIdentifier as the name when an existing project is not matched', async function () {
      const projectIdentifier = 'new-project'
      const modifiedImportData = Object.assign({}, this.importData, {projectIdentifier})
      const importedProject = await importProject(modifiedImportData)

      expect(importedProject.name).to.eq(modifiedImportData.projectIdentifier)
      expect(importedProject.goal.goalMetadata.goal_id).to.eq(modifiedImportData.goalIdentifier) // eslint-disable-line camelcase
    })

    it('updates goal and users when a valid project identifier is specified', async function () {
      const newProject = await factory.create('project', {chapterId: this.chapter.id, cycleId: this.cycle.id, phaseId: this.phase.id})
      const newPlayers = await factory.createMany('player', {chapterId: this.chapter.id, phaseId: this.phase.id}, 4)
      const newUsers = newPlayers.map(_idmPropsForUser)
      const newGoalNumber = 2

      useFixture.nockClean()
      useFixture.nockIDMFindUsers(newUsers)
      useFixture.nockGetGoalInfo(newGoalNumber)

      const importedProject = await importProject({
        ...this.importData,
        projectIdentifier: newProject.name,
        playerIdentifiers: newPlayers.map(p => newUsers.find(u => u.id === p.id).handle),
        goalIdentifier: newGoalNumber,
      })

      expect(importedProject.id).to.eq(newProject.id)
      expect(importedProject.chapterId).to.eq(this.chapter.id)
      expect(importedProject.cycleId).to.eq(this.cycle.id)
      expect(importedProject.playerIds.length).to.eq(newPlayers.length)
      expect(importedProject.goal.goalMetadata.goal_id).to.eq(newGoalNumber) // eslint-disable-line camelcase
      expectArraysToContainTheSameElements(importedProject.playerIds, newPlayers.map(p => p.id))
    })
  })
})

function _idmPropsForUser(user) {
  return {
    id: user.id,
    active: true,
    handle: `handle_${user.id}`,
  }
}
