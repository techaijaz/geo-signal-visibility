import express, { Application } from 'express'
import path from 'path'
import router from './router/apiRouter'
import globalErrorHandler, { notFoundError } from './middleware/globalErrorHandler'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import config from './config/config'

const app: Application = express()
//Middlewares
app.use(helmet())
app.use(cookieParser())
const allowedOrigins = [config.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174'].filter(Boolean) as string[]
app.use(
    cors({
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true)
            } else {
                callback(null, true) // Allow during dev if origin varies
            }
        },
        credentials: true
    })
)
app.use(express.json())
app.use(express.static(path.join(__dirname, '../', 'public')))

//Routs
app.use('/api/v1', router)

//404 Error handeler
app.use(notFoundError)

//Global Error handeler
app.use(globalErrorHandler)

export default app
