import config from 'src/config'

import {apiFetch} from './util'
import {getUserId} from './cache'

export default async function createMultiPartyDirectMessage(usernames, msg) {
  const allUsernames = [...usernames, config.server.chat.userName]
  const userIds = await Promise.all(allUsernames.map(username => getUserId(username)))
  const mpimOpenResult = await apiFetch('/api/mpim.open', {
    method: 'POST',
    body: {
      users: userIds.join(',')
    }
  })
  const result = await apiFetch('/api/chat.postMessage', {
    method: 'POST',
    body: {
      channel: mpimOpenResult.group.id,
      text: msg,
      as_user: true, // eslint-disable-line camelcase
    },
  })
  return result.ok
}
