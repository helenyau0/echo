module.exports = {
  server: {
    secure: true,
    rethinkdb: {
      replicas: 3,
    },
    newrelic: {
      enabled: true,
    },
    crm: {
      enabled: true,
    },
    sockets: {
      host: 'game.learnersguild.org',
    },
  },

  app: {
    minify: true,
    hotReload: false,
    devTools: false,
    noErrors: false,
  },
}
