import express from "express"
import logger from "morgan"
import dotenv from "dotenv"
import { createClient } from "@libsql/client"

import { Server } from "socket.io"
import { createServer } from "node:http"

dotenv.config()

const port = process.env.port ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url: "libsql://chat-eduardomtzsti.turso.io",
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    create table if not exists messages(
        id integer primary key autoincrement,
        content text,
        username text,
        avatar text 
    )    
`)

io.on('connection', async (socket) => {

    console.log("an user has connected")
    console.log("auth: ")
    console.log(socket.handshake.auth)

    socket.on('disconnect', () => {
        console.log('an user has disconnected')
    })

    socket.on('chat message', async (msg) => {

        let result
        //console.log("user emited: " + socket.handshake.auth.user.toString())
        const user = socket.handshake.auth.user
        const username = user.username ?? 'anonymous'
        const avatar = user.avatar ?? 'anonymous'
        try {
            result = await db.execute({
                sql: 'insert into messages (content,username,avatar) values(:msg,:username,:avatar)',
                args: { msg, username, avatar }
            })
        } catch (error) {
            console.error(error)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), user)
    })

    if (!socket.recovered) {
        try {
            const results = await db.execute({
                sql: 'select id,content,username,avatar from messages where id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            results.rows.forEach(row => {
                const user = {
                    username: row.username,
                    avatar: row.avatar
                }
                socket.emit('chat message', row.content, row.id, user)
            });
        } catch (e) {
            console.error(e)
        }
    }

})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log('server running on port ' + port)
})