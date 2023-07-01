module.exports = {
	env: 'test',
	project: 'abu',
	module: 'test',
	token: {
		host: '10.10.234.221',
		port: 19879,
		db: 5,
		password: 'dT&@h3ID^scKCahF',
	},
	http: {
		default: {
			port: 3342,
		},
	},
	db: {
		default: {
			host: '10.10.234.221',
			port: 14578,
			user: 'userbu',
			password: '9#gf*6S7fT1T',
			database: 'x_hash_game',
			connectionLimit: 10,
		},
	},
	redis: {
		default: {
			host: '10.10.234.221',
			port: 19879,
			db: 5,
			password: 'dT&@h3ID^scKCahF',
		},
	},
}
