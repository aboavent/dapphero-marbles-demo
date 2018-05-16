#!/usr/bin/env node

const FabricClient = require('fabric-client')
const path = require('path')
const glob = require('glob')
const program = require('commander')

function populate(connectionProfileCfg, cryptoCfg) {
  // Let's prepopulate the K/V store
  let configFilePath = path.join(__dirname, connectionProfileCfg);
  const creds = require(configFilePath)

  const fc = FabricClient.loadFromConfig(configFilePath);
  fc.initCredentialStores().then(() => {
    return fc.getStateStore()
  }).then((store) => {
    console.log(`Attempting to prepopulate key/value store located at '${store._dir}.'`)
    let promises = Object.keys(creds.organizations).map(org => {
      let p = new Promise((resolve, reject) => {
        glob(path.join(__dirname, `${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore/*_sk`), null, (err, privkeys) => {
          if (err || privkeys.length < 1) {
            console.error(`Unable to find private key: ${err}`)
            reject(err)
          }

          let userOpts = {
            username: `Admin@${org}.example.com`,
            mspid: `${org}MSP`,
            _org: org,
            cryptoContent: {
              signedCert: path.join(__dirname, `${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts/Admin@${org}.example.com-cert.pem`),
              privateKey: privkeys[0]
            },
            skipPersistence: false
          }

          resolve(userOpts)
        })
      })
      return p
    })

    Promise.all(promises).then(adminOpts => {
      let cbs = adminOpts.map((userOpts) => {
        let obj = {}
        return fc.getUserContext(userOpts.username, true).then(user => {
          if (user !== null) {
            return user
          } else {
            return fc.createUser(userOpts)
          }
        }).then(user => {
          obj.username = userOpts.username
          return fc.getPeersForOrg(userOpts._org)
        }).then(peers => {
          obj.peers = JSON.stringify(peers)
          return fc.queryChannels(peers[0], true)
        }).then(channels => {
          obj.channels = JSON.stringify(channels)
          return obj
        })
      })
      return Promise.all(cbs)
    }).then(objs => {
      console.log(objs)
      console.log("All set. Key value store populated.")
    })
  }).catch(err => {
    console.error(err)
    console.error("Someting went wrong")
  })
}

program
  .version('0.0.1', '-v, --version')
  .arguments('<connectionProfileCfg> <cryptoCfg>')
  .action(populate)
program.parse(process.argv)

if (process.argv.slice(2).length < 2) {
  program.outputHelp()
}
