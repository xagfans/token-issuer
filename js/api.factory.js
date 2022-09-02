/* global _, myApp, round, hexToAscii, asciiToHex, RippleAPI */

myApp.factory('XrpApi', ['$rootScope', function($rootScope) {
    let _remote = new ripple.RippleAPI({ server: "wss://g1.xrpgen.com", feeCushion: 1.1, maxFeeXRP: "0.2" });
    let _issuer;
    let _hotwallet;
   
    function convertAmount(amount) {
      if ("object" === typeof amount) {
        amount.currency = realCode(amount.currency);
        amount.value = amount.value.toString();
        return amount;
      } else {
        return new BigNumber(new BigNumber(amount).toPrecision(16)).toString()
      }
    };

    return {
      connect() {
        if (!_remote) throw new Error("NotConnectedError");
        return _remote.isConnected() ? Promise.resolve() : _remote.connect();
      },

      isValidAddress : function(address) {
        return ripple.RippleAPI.isValidClassicAddress(address);
      },
      isValidSecret : function(secret) {
        return _remote.isValidSecret(secret);
      },

      getAddress : function(secret) {
        let keypair = _remote.deriveKeypair(secret);
        return ripple.RippleAPI.deriveClassicAddress(keypair.publicKey);
      },
      
      checkFunded(address) {
        return new Promise(async (resolve, reject)=>{
          await this.connect();
          _remote.getAccountInfo(address || this.address).then(() => {
              resolve(true);
          }).catch(e => {
              if (e.data.error === 'actNotFound') {
                resolve(false);
              } else {
                reject(e);
              }
          });
        });
      },
      
      checkInfo(address) {
        return new Promise(async (resolve, reject)=>{
          try {
            await this.connect();
            let info = await _remote.getAccountInfo(address || this.address);
            resolve(info);
          } catch(e){
            if (e.data && e.data.error === 'actNotFound') {
              e.unfunded = true;
            }
            reject(e);
          };
        });
      },
      
      checkObjects(address) {
        return new Promise(async (resolve, reject)=>{
          try {
            await this.connect();
            let info = await _remote.getAccountObjects(address || this.address);
            resolve(info);
          } catch(e){
            if (e.data && e.data.error === 'actNotFound') {
              e.unfunded = true;
            }
            reject(e);
          };
        });
      },
      
      checkSettings(address) {
        return new Promise(async (resolve, reject)=>{
          try {
            await this.connect();
            let data = await _remote.getSettings(address);
            resolve(data);
          } catch(e){
            if (e.data && e.data.error === 'actNotFound') {
              e.unfunded = true;
            }
            reject(e);
          };
        });
      },
      
      checkBalances(address) {
        return new Promise(async (resolve, reject)=>{
          try {
            await this.connect();
            let bal = await _remote.getBalances(address);
            resolve(bal);
          } catch(e) {
            console.error('getBalance', e);
            reject(e);
          }
        });
      },
      
      checkTrustlines(address) {
        return new Promise(async (resolve, reject)=>{
          await this.connect();
          _remote.getTrustlines(address).then((ret) => {
            let lines = {};
            ret.forEach((item)=>{
              var keystr = key(item.specification.currency, item.specification.counterparty);
              lines[keystr] = item.specification; //{limit: "100000000", currency: "USD", counterparty: "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y", ripplingDisabled: true}
              lines[keystr].balance = item.state.balance;
            });
            _trustlines = lines;
            // console.log('lines:', ret);
            resolve(lines);
          }).catch(e => {
            console.error('getTrustlines', e);
            reject(e);
          });
        });
      },
      
      changeSettings(settings, secret) {        
        return new Promise(async (resolve, reject)=> {
          try {
            let address = this.getAddress(secret);
            let ledger = await _remote.getLedger();
            let prepared = await _remote.prepareSettings(address, settings);
            const {signedTransaction, id} = _remote.sign(prepared.txJSON, secret);
            let result = await _remote.submit(signedTransaction, true);
            if ("tesSUCCESS" !== result.engine_result) {
              console.warn(result);
              return reject(new Error(result.engine_result_message || result.engine_result));
            }
            await this.commit(id, ledger.ledgerVersion, prepared.instructions.maxLedgerVersion);
            resolve(result);
          } catch (err) {
            console.info('changeSettings', err.data || err);
            reject(err);
          }
        });
      },
      
      changeTrust(code, issuer, limit, secret) {
        const trustline = {
          currency: realCode(code),
          counterparty: issuer,
          limit: limit.toString(),
          ripplingDisabled: true
        };
        return new Promise(async (resolve, reject)=> {
          try {
            let address = this.getAddress(secret);
            let ledger = await _remote.getLedger();
            let prepared = await _remote.prepareTrustline(address, trustline);
            const {signedTransaction, id} = _remote.sign(prepared.txJSON, secret);
            let result = await _remote.submit(signedTransaction, true);            
            if ("tesSUCCESS" !== result.engine_result && "terQUEUED" !== result.engine_result) {
              console.warn(result);
              return reject(new Error(result.engine_result_message || result.engine_result));
            }
            await this.commit(id, ledger.ledgerVersion, prepared.instructions.maxLedgerVersion);
            resolve(id);
          } catch (err) {
            console.info('changeTrust', err);
            reject(err);
          }
        });
      },
      
      payment(destinationAddress, amount, secret) {
        let address = this.getAddress(secret);
        const payment = {
            "source": {
              "address": address,
              "maxAmount": convertAmount(amount)
            },
            "destination": {
              "address": destinationAddress,
              "amount": convertAmount(amount)
            }
        }
        payment.destination.tag = 12345678;
        
        return new Promise(async (resolve, reject)=>{
          try {
            let ledger = await _remote.getLedger();
            let prepared = await _remote.preparePayment(address, payment);
            const {signedTransaction, id} = _remote.sign(prepared.txJSON, secret);
            let result = await _remote.submit(signedTransaction, true);
            if ("tesSUCCESS" !== result.engine_result && "terQUEUED" !== result.engine_result) {
              console.warn(result);
              return reject(new Error(result.engine_result_message || result.engine_result));
            }
            resolve(id);
          } catch (err) {
            if (err.data) {
              console.error(err.data);
              return reject(new Error(err.data.engine_result_message || err.data.engine_result || err.data.error_exception || 'UNKNOWN'));
            } 
            console.error('payment', payment, err);
            reject(err);
          }
        });
      },

      verifyTx(hash, minLedger, maxLedger, resolve, reject) {
        const options = {
          minLedgerVersion: minLedger,
          maxLedgerVersion: maxLedger
        };
        _remote.getTransaction(hash, options).then(data => {
          if (data.outcome.result === 'tesSUCCESS') {
            return resolve(hash);
          } else {
            console.error(data);
            return reject(data.outcome.result);
          }
        }).catch(err => {
          console.warn('verify fail', err);
          /* If transaction not in latest validated ledger, try again until max ledger hit */
          if (err instanceof _remote.errors.PendingLedgerVersionError) {
             setTimeout(() => this.verifyTx(hash, minLedger, maxLedger, resolve, reject), 1000);
          } else {
            return reject(err.message);
          }
        });
      },

      commit(hash, minLedger, maxLedger) {
        return new Promise(async (resolve, reject)=>{
          return this.verifyTx(hash, minLedger, maxLedger, resolve, reject);
        });
      }
      

    };
  } ]);
