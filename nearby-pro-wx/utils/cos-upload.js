const api = require('./api')

/**
 * COS PostObject 直传（无 npm 依赖，ES5 + Promise）。
 * 签名算法与 cos-wx-sdk-v5 的 getAuth 完全一致（POST 直传场景）：
 *   SignKey      = HmacSHA1(TmpSecretKey, KeyTime) -> hex
 *   FormatString = method \n pathname \n params \n headers \n（POST 直传固定 post / 与 host 头）
 *   StringToSign = sha1 \n qSignTime \n Sha1Hex(FormatString) \n
 *   qSignature   = HmacSHA1(SignKey, StringToSign) -> hex
 * 完整 Authorization 串放进表单 Signature 字段，另带 x-cos-security-token 表单字段。
 */

// ---------- SHA1 / HMAC-SHA1（内联 ES5 实现，供签名使用） ----------

// 字符串 -> UTF-8 字节数组（含代理项对处理）
function utf8Bytes(str) {
  str = String(str == null ? '' : str)
  var bytes = []
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      var lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        var cp = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00)
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
        i++
      } else {
        bytes.push(0xef, 0xbf, 0xbd) // 孤立代理项按 U+FFFD 编码
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function rol(x, n) {
  return ((x << n) | (x >>> (32 - n))) | 0
}

// SHA1 核心：入参出参均为字节数组，返回 5 个 32 位字的数组
function sha1Words(msg) {
  var len = msg.length
  var padded = msg.concat([0x80])
  while (padded.length % 64 !== 56) padded.push(0)
  // 64 位大端消息位长
  var bitLenHi = Math.floor(len / 536870912)
  var bitLenLo = (len % 536870912) * 8
  padded.push((bitLenHi >>> 24) & 0xff, (bitLenHi >>> 16) & 0xff, (bitLenHi >>> 8) & 0xff, bitLenHi & 0xff)
  padded.push((bitLenLo >>> 24) & 0xff, (bitLenLo >>> 16) & 0xff, (bitLenLo >>> 8) & 0xff, bitLenLo & 0xff)

  var h0 = 0x67452301
  var h1 = 0xefcdab89
  var h2 = 0x98badcfe
  var h3 = 0x10325476
  var h4 = 0xc3d2e1f0
  var w = new Array(80)
  for (var off = 0; off < padded.length; off += 64) {
    var i
    for (i = 0; i < 16; i++) {
      var j = off + i * 4
      w[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) | 0
    }
    for (i = 16; i < 80; i++) {
      w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }
    var a = h0
    var b = h1
    var c = h2
    var d = h3
    var e = h4
    for (i = 0; i < 80; i++) {
      var f, k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      var t = (rol(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rol(b, 30)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  return [h0, h1, h2, h3, h4]
}

function wordsToBytes(words) {
  var bytes = []
  for (var i = 0; i < words.length; i++) {
    var x = words[i] >>> 0
    bytes.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff)
  }
  return bytes
}

function bytesToHex(bytes) {
  var hex = ''
  for (var i = 0; i < bytes.length; i++) {
    hex += ('0' + bytes[i].toString(16)).slice(-2)
  }
  return hex
}

function sha1Hex(str) {
  return bytesToHex(wordsToBytes(sha1Words(utf8Bytes(str))))
}

// 标准 HMAC-SHA1，输出 40 位 hex
function hmacSha1Hex(key, msg) {
  var keyBytes = utf8Bytes(key)
  if (keyBytes.length > 64) {
    keyBytes = wordsToBytes(sha1Words(keyBytes))
  }
  var ipad = []
  var opad = []
  for (var i = 0; i < 64; i++) {
    var b = i < keyBytes.length ? keyBytes[i] : 0
    ipad.push(b ^ 0x36)
    opad.push(b ^ 0x5c)
  }
  var inner = wordsToBytes(sha1Words(ipad.concat(utf8Bytes(msg))))
  return bytesToHex(wordsToBytes(sha1Words(opad.concat(inner))))
}

// ---------- STS 临时凭证缓存 ----------

var credCache = null
var credPromise = null

function getCredentials() {
  // 过期前 60s 内视为不可用，避免签名成功但请求到达时已过期
  var now = Math.round(Date.now() / 1000)
  if (credCache && credCache.expiredTime - now > 60) {
    return Promise.resolve(credCache)
  }
  if (!credPromise) {
    credPromise = api
      .getCosCredentials()
      .then(function (cred) {
        credCache = cred
        return cred
      })
      .catch(function (e) {
        credPromise = null
        throw e
      })
  }
  return credPromise
}

// ---------- PostObject 签名与上传 ----------

// 生成 COS PostObject 表单用的完整 Authorization 串（与 SDK 同款，只签 host 头）
function buildPostAuthorization(cred, keyTime) {
  var host = cred.bucket + '.cos.' + cred.region + '.myqcloud.com'
  var formatString = ['post', '/', '', 'host=' + host, ''].join('\n')
  var stringToSign = ['sha1', keyTime, sha1Hex(formatString), ''].join('\n')
  var signKey = hmacSha1Hex(cred.tmpSecretKey, keyTime)
  var qSignature = hmacSha1Hex(signKey, stringToSign)
  return [
    'q-sign-algorithm=sha1',
    'q-ak=' + cred.tmpSecretId,
    'q-sign-time=' + keyTime,
    'q-key-time=' + keyTime,
    'q-header-list=host',
    'q-url-param-list=',
    'q-signature=' + qSignature
  ].join('&')
}

function mimeOf(ext) {
  var map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  }
  return map[ext] || ''
}

/**
 * 上传一张图片，resolve 访问 URL。
 * filePath 来自 wx.chooseMedia 的 tempFilePath（临时文件）或已上传过的 https 地址。
 */
function uploadImage(filePath) {
  // 只对已有的 https 网络图（回填的 COS 图）放行；微信临时路径形如 http://tmp/、wxfile://，仍需上传
  if (/^https:\/\//.test(filePath)) {
    return Promise.resolve(filePath)
  }
  return getCredentials().then(function (cred) {
    var ext = ''
    var m = /\.([a-zA-Z0-9]+)$/.exec(filePath)
    if (m) ext = '.' + m[1].toLowerCase()
    var key = 'nearby/image/' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + ext
    var keyTime = cred.startTime + ';' + cred.expiredTime
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: cred.baseUrl + '/',
        name: 'file',
        filePath: filePath,
        formData: {
          key: key,
          success_action_status: '200',
          Signature: buildPostAuthorization(cred, keyTime),
          'x-cos-security-token': cred.sessionToken,
          acl: 'public-read',
          'Content-Type': mimeOf(ext)
        },
        success: function (res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(cred.baseUrl + '/' + key)
            return
          }
          // 失败体是 XML，尽量抽出 <Message> 给出可读原因
          var message = ''
          var mm = /<Message>([^<]+)<\/Message>/.exec(res.data || '')
          if (mm) message = mm[1]
          reject(new Error('上传失败' + (message ? '：' + message : '（HTTP ' + res.statusCode + '）')))
        },
        fail: function (err) {
          reject(new Error((err && err.errMsg) || '上传失败，请检查网络'))
        }
      })
    })
  })
}

module.exports = {
  uploadImage,
  // 以下仅供测试对拍
  _sha1Hex: sha1Hex,
  _hmacSha1Hex: hmacSha1Hex,
  _buildPostAuthorization: buildPostAuthorization
}
