/**
 * A Connection handler for Amazon ES.
 *
 * Uses the aws-sdk to make signed requests to an Amazon ES endpoint.
 * Define the Amazon ES config and the connection handler
 * in the client configuration:
 *
 * var es = require('elasticsearch').Client({
 *  hosts: 'https://amazon-es-host.us-east-1.es.amazonaws.com',
 *  connectionClass: require('http-aws-es'),
 *  amazonES: {
 *    region: 'us-east-1',
 *    accessKey: 'AKID',
 *    secretKey: 'secret',
 *    credentials: new AWS.EnvironmentCredentials('AWS') // Optional
 *  }
 * });
 *
 * @param client {Client} - The Client that this class belongs to
 * @param config {Object} - Configuration options
 * @param [config.protocol=http:] {String} - The HTTP protocol that this connection will use, can be set to https:
 * @class HttpConnector
 */

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var AWS = require('aws-sdk');
var HttpConnector = require('elasticsearch/src/lib/connectors/http');
var _ = require('elasticsearch/src/lib/utils');
var zlib = require('zlib');

var HttpAmazonESConnector = (function (_HttpConnector) {
  _inherits(HttpAmazonESConnector, _HttpConnector);

  function HttpAmazonESConnector(host, config) {
    var _this = this;

    _classCallCheck(this, HttpAmazonESConnector);

    _get(Object.getPrototypeOf(HttpAmazonESConnector.prototype), 'constructor', this).call(this, host, config);
    this.endpoint = new AWS.Endpoint(host.host);
    var c = config.amazonES;
    if (c.getCredentials) {
      AWS.config.getCredentials(function (err) {
        if (err) {
          throw err;
        }
        _this.creds = AWS.config.credentials;
      });
    } else if (c.credentials) {
      this.creds = c.credentials;
    } else {
      this.creds = new AWS.Credentials(c.accessKey, c.secretKey);
    }
    this.amazonES = c;
  }

  _createClass(HttpAmazonESConnector, [{
    key: 'request',
    value: function request(params, cb) {
      var _this2 = this;

      var incoming;
      var timeoutId;
      var request;
      var req;
      var status = 0;
      var headers = {};
      var log = this.log;
      var response;
      var abort = false;

      var reqParams = this.makeReqParams(params);
      // general clean-up procedure to run after the request
      // completes, has an error, or is aborted.
      var cleanUp = _.bind(function (err) {
        clearTimeout(timeoutId);

        req && req.removeAllListeners();
        incoming && incoming.removeAllListeners();

        if (err instanceof Error === false) {
          err = void 0;
        }

        log.trace(params.method, reqParams, params.body, response, status);
        if (err) {
          cb(err);
        } else {
          cb(err, response, status, headers);
        }
      }, this);

      var signAndSend = function signAndSend() {
        // Sign the request (Sigv4)
        var signer = new AWS.Signers.V4(request, 'es');
        signer.addAuthorization(_this2.creds, new Date());

        var send = new AWS.NodeHttpClient();
        req = send.handleRequest(request, null, function (_incoming) {
          incoming = _incoming;
          status = incoming.statusCode;
          headers = incoming.headers;
          response = '';

          var encoding = (headers['content-encoding'] || '').toLowerCase();
          if (encoding === 'gzip' || encoding === 'deflate') {
            incoming = incoming.pipe(zlib.createUnzip());
          }

          incoming.setEncoding('utf8');
          incoming.on('data', function (d) {
            response += d;
          });

          incoming.on('error', cleanUp);
          incoming.on('end', cleanUp);
        }, cleanUp);

        req.on('error', cleanUp);

        req.setNoDelay(true);
        req.setSocketKeepAlive(true);
      };

      request = new AWS.HttpRequest(this.endpoint);

      // copy across params
      for (var p in reqParams) {
        request[p] = reqParams[p];
      }
      request.region = this.amazonES.region;
      if (params.body) request.body = params.body;
      if (!request.headers) request.headers = {};
      request.headers['presigned-expires'] = false;
      request.headers['Host'] = this.endpoint.host;

      if (this.amazonES.getCredentials && !this.creds) {
        (function () {
          var waitForCredentials = function waitForCredentials() {
            setTimeout(function () {
              if (abort) {
                return;
              } else if (_this2.creds) {
                signAndSend();
              } else {
                waitForCredentials();
              }
            }, 100);
          };
          waitForCredentials();
        })();
      } else if (this.creds.needsRefresh()) {
        this.creds.refresh(function (err) {
          if (err) {
            cleanUp(err);
          } else {
            signAndSend();
          }
        });
      } else {
        signAndSend();
      }

      return function () {
        abort = true;
        req && req.abort();
      };
    }
  }]);

  return HttpAmazonESConnector;
})(HttpConnector);

module.exports = HttpAmazonESConnector;

