const moment = require('moment')
const mysql = require('mysql')
const redis = require('redis')
const express = require('express')
const bodyParser = require('body-parser')
const mutipart = require('connect-multiparty')
const mutipartMiddeware = mutipart()
const axios = require('axios')
let config
process.on('uncaughtException', (err) => {
	let prefix = 'This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason "'
	let idx = err.message.indexOf(prefix)
	if (idx >= 0) {
		let message = err.message.substr(prefix.length)
		message = message.substr(0, message.length - 2)
		console.log(moment().format('YYYY-MM-DD HH:mm:ss'), message)
		return
	}
	console.log(moment().format('YYYY-MM-DD HH:mm:ss'), err)
})
axios.interceptors.request.use(
	(config) => {
		if (/get/i.test(config.method)) {
			config.params = config.params || {}
			config.params.t = Date.parse(new Date()) / 1000
		}
		return config
	},
	(error) => {
		return Promise.reject(error)
	}
)
let server = this
let tokenredis
let zdb = function (cfg) {
	this._pool = mysql.createPool(cfg)
	this.query = async (sql, ...args) => {
		return new Promise((resolve, reject) => {
			this._pool.getConnection((err1, conn) => {
				if (err1) {
					let message = `${err1.message} | ${sql} ${JSON.stringify(args)}`
					reject(message)
				} else {
					conn.query(sql, args, (err2, result) => {
						if (err2) {
							this._pool.releaseConnection(conn)
							let message = `${err2.message} | ${sql} - ${JSON.stringify(args)}`
							reject(message)
						} else {
							this._pool.releaseConnection(conn)
							resolve(result)
						}
					})
				}
			})
		})
	}
	this.transaction = async (callback) => {
		return new Promise((resolve, reject) => {
			this._pool.getConnection(async (err1, conn) => {
				if (err1) {
					let message = `${err1.message}`
					reject(message)
				} else {
					conn.beginTransaction(async (terr) => {
						if (terr) {
							this._pool.releaseConnection(conn)
							reject(terr)
						} else {
							try {
								let tr = await callback(async (sql, ...args) => {
									return new Promise((resolve, reject) => {
										conn.query(sql, args, (err, result) => {
											if (err) {
												let message = `${err.message} | ${sql} - ${JSON.stringify(args)}`
												reject(message)
											} else {
												resolve(result)
											}
										})
									})
								})
								if (tr === true) {
									conn.commit(() => {})
								} else {
									conn.rollback(() => {})
								}
								this._pool.releaseConnection(conn)
								resolve()
							} catch (e) {
								conn.rollback(() => {})
								reject(e)
							}
						}
					})
				}
			})
		})
	}
}

let zredis = function (cfg) {
	this._pool = []
	cfg.user = cfg.user || ''
	let opt = { url: `redis://${cfg.user}:${cfg.password}@${cfg.host}:${cfg.port}` }
	{
		for (let i = 0; i < 10; i++) {
			let r = redis.createClient(opt)
			r.on('error', (err) => {
				console.log('redis:', err.message)
			})
			r.connect().then(() => {
				r.select(cfg.db)
			})
			this._pool.push(r)
		}
	}
	{
		this._sub = redis.createClient(opt)
		this._sub.on('error', (err) => {
			console.log('redis:', err.message)
		})
		this._sub.connect().then(() => {
			this._sub.subscribe('__ping__', (msg) => {})
		})
	}
	{
		this._pub = redis.createClient(opt)
		this._pub.on('error', (err) => {
			console.log('redis:', err.message)
		})
		this._pub.connect().then(() => {
			this._pub.publish('__ping__', 'ping')
		})
	}
	this.subscribe = (channel, callback) => {
		this._sub.subscribe(channel, (message) => {
			try {
				message = JSON.parse(message)
				callback(message)
			} catch (e) {
				callback(message)
			}
		})
	}
	this.unsubscribe = (channel) => {
		this._sub.unsubscribe(channel)
	}
	this.publish = (channel, value) => {
		if (typeof value === 'object') value = JSON.stringify(value)
		this._pub.publish(channel, value)
	}
	this.set = (key, value) => {
		if (typeof value === 'object') value = JSON.stringify(value)
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.set(key, `${value}`)
				.then(() => {
					resolve()
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.get = (key) => {
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.get(key)
				.then((val) => {
					resolve(val)
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.expire = (key, expire) => {
		if (expire <= 0) return
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.expire(key, expire)
				.then(() => {
					resolve()
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.setex = (key, value, expire) => {
		if (expire <= 0) return
		if (typeof value === 'object') value = JSON.stringify(value)
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.SETEX(key, expire, `${value}`)
				.then(() => {
					resolve()
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.del = (key) => {
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.del(key)
				.then(() => {
					resolve()
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.hset = (key, field, value) => {
		if (typeof value === 'object') value = JSON.stringify(value)
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.HSET(key, field, value)
				.then((val) => {
					resolve(val)
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.hget = (key, field) => {
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.HGET(key, field)
				.then((val) => {
					resolve(val)
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.hmget = (key, fields) => {
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.HMGET(key, fields)
				.then((val) => {
					resolve(val)
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.hgetall = async (key) => {
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.HGETALL(key)
				.then((val) => {
					resolve(val)
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
	this.rpush = async (key, value) => {
		if (typeof value === 'object') value = JSON.stringify(value)
		return new Promise((resolve, reject) => {
			let cli = this._pool[Math.floor(Math.random() * 100000) % this._pool.length]
			cli
				.RPUSH(key, value)
				.then(() => {
					resolve()
				})
				.catch((e) => {
					reject(e)
				})
		})
	}
}

let zhttp = function (cfg) {
	this._app = express()
	this._app.use((req, res, next) => {
		res.header('Access-Control-Allow-Origin', '*')
		res.header('Access-Control-Allow-Methods', 'GET,POST')
		res.header('Access-Control-Allow-Headers', 'Content-Type, x-token, Content-Length, X-Requested-With')
		if (req.method == 'OPTIONS') {
			res.sendStatus(200)
		} else {
			next()
		}
	})
	this._app.listen(cfg.port, () => {})
	this.static = (path) => {
		this._app.static(path)
	}
	this.get = async (url, data) => {
		data = data || {}
		return new Promise(async (resolve, reject) => {
			try {
				let r = await axios.get(url, { params: data })
				resolve(r.data)
			} catch (e) {
				reject(e.message)
			}
		})
	}
	this.post = async (url, data) => {
		data = data || {}
		return new Promise(async (resolve, reject) => {
			try {
				let r = await axios.post(url, data)
				resolve(r.data)
			} catch (e) {
				reject(e.message)
			}
		})
	}
	this.on_post = async (url, callback) => {
		this._on_post(url, false, null, callback)
	}
	this.delToken = (token) => {
		tokenredis.del(`${config.project}:${config.module}:token:${token}`)
	}
	this.setToken = (token, data, expire) => {
		let key = `${config.project}:${config.module}:token:${token}`
		tokenredis.setex(key, data, 7 * 24 * 60 * 60)
		if (expire && expire > 0) tokenredis.expire(key, expire)
	}
	this._on_post = async (url, noauth, authpath, callback) => {
		this._app.post(url, bodyParser.json(), async (req, res) => {
			req.getip = () => {
				let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress || ''
				if (ip == '::1') return '127.0.0.1'
				ip = ip.match(/\d+.\d+.\d+.\d+/)
				ip = ip ? ip.join('.') : null
				return ip
			}
			req.respOk = (data) => {
				data = data || {}
				let senddata = {
					code: 200,
					msg: 'success',
					data: data,
				}
				res.status(200).send(senddata)
			}
			req.respErr = (msg, data) => {
				msg = msg || 'fail'
				data = data || {}
				let senddata = {
					code: 100,
					msg: msg,
					data: data,
				}
				res.status(200).send(senddata)
			}
			req.validate = (patten) => {
				for (let i in patten) {
					let tag = patten[i]
					tag = tag.split(',')
					let data = req.body[i]
					for (let j in tag) {
						if (tag[j] == '必填') {
							if (data == undefined || data == null) {
								req.respErr('参数不正确', { field: `${i}`, errmsg: '必填' })
								return
							}
						} else if (tag[j] == '数字') {
							if (data != undefined && data != null && typeof data != 'number') {
								req.respErr('参数不正确', { field: `${i}`, errmsg: '须是数字' })
								return
							}
						} else if (tag[j] == '字符串') {
							if (data != null && data != undefined) {
								data = `${req.body[i]}`
								req.body[i] = data
							}
						} else {
							if (data != null && data != undefined) {
								let sub = tag[j].split('=')
								if (sub[0] == '最小') {
									if (data < Number(sub[1])) {
										req.respErr('参数不正确', { field: `${i}`, errmsg: '小于最小值', value: Number(sub[1]) })
										return
									}
								} else if (sub[0] == '最大') {
									if (data > Number(sub[1])) {
										req.respErr('参数不正确', { field: `${i}`, errmsg: '大于最大值', value: Number(sub[1]) })
										return
									}
								}
								if (sub[0] == '最小长度') {
									if (data.length < Number(sub[1])) {
										req.respErr('参数不正确', { field: `${i}`, errmsg: '小于最小长度', value: Number(sub[1]) })
										return
									}
								}
								if (sub[0] == '最大长度') {
									if (data.length > Number(sub[1])) {
										req.respErr('参数不正确', { field: `${i}`, errmsg: '大于最大长度', value: Number(sub[1]) })
										return
									}
								}
							}
						}
					}
				}
				return req.body
			}
			if (noauth) {
				tokenredis.rpush(`${config.project}:${config.module}:requests`, {
					path: req.path,
					data: req.body,
					ip: req.getip(),
				})
				try {
					let cr = await callback(req)
					if (cr) req.respOk(cr)
				} catch (e) {
					console.log(e)
					req.respErr(e)
				}
			} else {
				let token = req.headers['x-token']
				if (!token) {
					tokenredis.rpush(`${config.project}:${config.module}:requests`, {
						path: req.path,
						data: req.body,
						ip: req.getip(),
					})
					req.respErr('未登录,请登录', {})
				} else {
					let userdata = await tokenredis.get(`${config.project}:${config.module}:token:${token}`)
					if (!userdata) {
						req.respErr('登录已过期,请重新登录', {})
					} else {
						req.userdata = JSON.parse(userdata)
						try {
							let cr = await callback(req)
							if (cr) req.respOk(cr)
						} catch (e) {
							console.log(e)
							req.respErr(e)
						}
					}
				}
			}
		})
	}
}

server.init = async (cfg) => {
	config = cfg
	return new Promise((resolve, reject) => {
		if (config.token) tokenredis = new zredis(config.token)
		for (let i in config.db) {
			let cfg = config.db[i]
			if (i == 'default') i = 'db'
			server[i] = new zdb(cfg)
		}
		for (let i in config.redis) {
			let cfg = config.redis[i]
			if (i == 'default') i = 'redis'
			server[i] = new zredis(cfg)
		}
		for (let i in config.http) {
			let cfg = config.http[i]
			if (i == 'default') i = 'http'
			server[i] = new zhttp(cfg)
		}

		setTimeout(() => resolve(), 500)
	})
}
module.exports = server
