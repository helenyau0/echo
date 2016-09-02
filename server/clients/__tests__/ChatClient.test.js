/* eslint-env mocha */
/* global expect, testContext */
/* eslint-disable prefer-arrow-callback, no-unused-expressions */

import nock from 'nock'

import config from 'src/config'
import ChatClient from 'src/server/clients/ChatClient'

describe(testContext(__filename), function () {
  beforeEach(function () {
    this.loginResponse = {
      data: {
        authToken: 'L7Cf5bJAcNXkRuo0ZRyu0QmjzSIcFCO1QBpKYM0nE3g',
        userId: 'L9Dnu2G2NSWm8cQpr'
      },
      status: 'success'
    }
    this.apiScope = nock(config.server.chat.baseURL)
      .post('/api/login')
      .reply(200, this.loginResponse)
  })

  describe('login()', function () {
    it('returns the parsed response on success', function () {
      const client = new ChatClient()
      return expect(client.login()).to.eventually.deep.equal(this.loginResponse.data)
    })
  })

  describe('sendDirectMessage()', function () {
    const apiResponse = {
      status: 'success'
    }

    beforeEach(function () {
      this.apiScope.post(`/hooks/${config.server.chat.webhookTokens.DM}`)
        .reply(200, apiResponse)
    })

    it('returns the parsed response on success', function () {
      const client = new ChatClient()
      return (
        expect(client.sendDirectMessage('someuser', 'somemessage'))
          .to.eventually.deep.equal(apiResponse.result)
      )
    })
  })

  describe('sendChannelMessage()', function () {
    beforeEach(function () {
      this.sendChannelMessageAPIResponse = {
        result: {
          _id: '79ugwPTBQ65EHw6BD',
          msg: 'the message',
          rid: 'cRSDeB4a5ePSNSMby',
          ts: '2016-05-20T12:28:12.064Z',
          u: {
            _id: 'L9Dnu2G2NSWm8cQpr',
            username: 'echo'
          }
        },
        status: 'success'
      }
      this.apiScope.post('/api/lg/rooms/channel/send')
        .reply(200, this.sendChannelMessageAPIResponse)
    })

    it('returns the parsed response on success', function () {
      const client = new ChatClient()
      return (
        expect(client.sendChannelMessage('channel', 'message'))
          .to.eventually.deep.equal(this.sendChannelMessageAPIResponse.result)
      )
    })
  })

  describe('createChannel()', function () {
    beforeEach(function () {
      this.channelName = 'perfect-penguin'
      this.topic = '[Goal 1: lorem ipsum](http://example.com)'
      this.members = ['echo']
      this.createChannelAPIResponse = {
        status: 'success',
        room: {
          rid: 'BFWXgKacy8e4vjXJL',
          name: this.channelName,
          topic: this.topic,
          members: this.members,
        }
      }
      this.apiScope.post('/api/lg/rooms')
        .reply(200, this.createChannelAPIResponse)
    })

    it('returns the parsed response on success', function () {
      const client = new ChatClient()
      return (
        expect(client.createChannel(this.channelName, this.members, this.topic))
          .to.eventually.deep.equal(this.createChannelAPIResponse.room)
      )
    })
  })

  describe('joinChannel()', function () {
    beforeEach(function () {
      this.channelName = 'perfect-penguin'
      this.members = ['echo']
      this.joinChannelAPIResponse = {
        status: 'success',
        result: {
          room: this.channelName,
          usersJoined: ['echo'],
          alreadyInRoom: [],
        }
      }
      this.apiScope.post(`/api/lg/rooms/${this.channelName}/join`)
        .reply(200, this.joinChannelAPIResponse)
    })

    it('returns the parsed response on success', function () {
      const client = new ChatClient()
      return (
        expect(client.joinChannel(this.channelName, this.members))
          .to.eventually.deep.equal(this.joinChannelAPIResponse.result)
      )
    })
  })

  describe('deleteChannel()', function () {
    beforeEach(function () {
      this.client = new ChatClient()
      this.deleteChannelSuccessAPIResponse = {
        status: 'success',
        result: 1,
      }
      this.apiScope.delete('/api/lg/rooms/existing-room')
        .reply(200, this.deleteChannelSuccessAPIResponse)
      this.deleteChannelFailureAPIResponse = {
        status: 'fail',
        message: "TypeError::Cannot read property '_id' of undefined",
      }
      this.apiScope.delete('/api/lg/rooms/non-existant-room')
        .reply(500, this.deleteChannelFailureAPIResponse)
    })

    it('returns true if the channel exists', function () {
      return (
        expect(this.client.deleteChannel('existing-room'))
          .to.eventually.deep.equal(true)
      )
    })

    it('throws an error if the channel does not exist', function () {
      return (
        expect(this.client.deleteChannel('non-existant-room'))
          .to.be.rejected
      )
    })
  })
})
