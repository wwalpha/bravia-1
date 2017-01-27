'use strict';

const SsdpClient = require('node-ssdp').Client;
const Request = require('request');
const URL = require('url');
const parseString = require('xml2js').parseString;

const ServiceProtocol = require('./service-protocol');

const SSDP_SERVICE_TYPE = 'urn:schemas-sony-com:service:IRCC:1';
const SERVICE_PROTOCOLS = [
  'accessControl',
  'appControl',
  'audio',
  'avContent',
  'browser',
  'cec',
  'encryption',
  'guide',
  'recording',
  'system',
  'videoScreen'
];

class Bravia {
  constructor(host, port = 80, psk = '0000', timeout = 5000) {
    this.host = host;
    this.port = port;
    this.psk = psk;
    this.timeout = timeout;
    this.protocols = SERVICE_PROTOCOLS;

    for (let key in this.protocols) {
      let protocol = this.protocols[key];
      this[protocol] = new ServiceProtocol(this, protocol);
    }

    this._url = `http://${this.host}:${this.port}/sony`;
  }

  static discover(timeout = 3000) {
    return new Promise((resolve, reject) => {
      let ssdp = new SsdpClient();
      let discovered = [];

      ssdp.on('response', (headers, statusCode) => {
        if (statusCode === 200) {
          Request.get(headers.LOCATION, (error, response, body) => {
            if (!error && response.statusCode === 200) {
              parseString(body, (err, result) => {
                if (!err) {
                  try {
                    let device = result.root.device[0];
                    let service = device.serviceList[0].service
                      .find(service => service.serviceType[0] === SSDP_SERVICE_TYPE);

                    if (service) {
                      let api = URL.parse(service.controlURL[0]);
                      discovered.push({
                        host: api.host,
                        port: (api.port || 80),
                        friendlyName: device.friendlyName[0],
                        manufacturer: device.manufacturer[0],
                        manufacturerURL: device.manufacturerURL[0],
                        modelName: device.modelName[0],
                        UDN: device.UDN[0]
                      });
                    }
                  } catch(e) {}
                }
              });
            }
          });
        }
      });

      ssdp.search(SSDP_SERVICE_TYPE);

      let timer = setTimeout(() => {
        ssdp.stop();
        resolve(discovered);
      }, timeout);
    });
  }

  send(ircc) {
    let body = `<?xml version="1.0"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <s:Body>
                <u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">
                    <IRCCCode>${ircc}</IRCCCode>
                </u:X_SendIRCC>
            </s:Body>
        </s:Envelope>`;

    return this._request({
      path: '/IRCC',
      body: body
    });
  }

  _request(options) {
    return new Promise((resolve, reject) => {
      options.timeout = this.timeout;
      options.url = this._url + options.path;
      options.headers = {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPACTION': '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        'X-Auth-PSK': this.psk
      };

      Request.post(options, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          resolve(body);
        } else {
          reject((error ? error : new Error(body.error[1])));
        }
      });
    });
  }
}

module.exports = Bravia;
