const config = require('./config.js')
const zero = require('./zero.js')
let server = this
setTimeout(() => server.main(), 1)

server.main = async () => {
	await zero.init(config)
	zero.http.on_post('/test', async (ctx) => {
		let reqdata = ctx.validate({
			SellerId: '必填,数字,最小=200,最大=300',
			def: '必填,字符串,最小长度=6,最大长度=32',
			acx: '字符串',
		})
		if (!reqdata) return
		console.log(ctx.userdata)
		return { a: 1, b: 2 }
	})
}
