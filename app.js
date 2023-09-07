const express = require('express');
const cors = require('cors');
require('dotenv').config();
const morgan = require('morgan');
const { DataSource } = require('typeorm');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const port = 8001;

const app = express();

app.use(cors());
app.use(express.json())
app.use(morgan('dev'));

const appDataSource = new DataSource({
    type: process.env.DB_TYPE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

appDataSource.initialize().then(() => console.log("Datasource initialized."));

app.get('/', (req, res) => {
    return res.status(200).json({"message": "Hello, World!"});
});

function throwError (condition, statusCode, message) {
    if (condition) {
        const error = new Error(message);
        error.status = statusCode;
        throw error;
    }
}

function checkPasswordValidity (password) {
    const hasTextAndNumber = new RegExp("\\w+");
    const hasSymbol = new RegExp("[.!#$%&'*+-/=?^_`{|}~]");
    return hasTextAndNumber.test(password) && hasSymbol.test(password);
}

function checkEmailValidity (email) {
    const hasValidAddress = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    return hasValidAddress.test(email);
}

async function createUser (req, res) {
    try {
        // body parse
        const {email, password} = req.body;
        // input validity
        throwError(!email || !password, 400, "KEY_ERROR");
        
        throwError(password.length < 8, 400, "INVALID_PASSWORD");

        const isPasswordValid = checkPasswordValidity(password);
        throwError(!isPasswordValid, 400, "INVALID_PASSWORD");

        const isEmailValid = checkEmailValidity(email);
        throwError(!isEmailValid, 400, "INVALID_EMAIL_ADDRRESS");
        // duplicate check in catch block

        // encrypt password
        const hash = await bcrypt.hash(password, 10);
        
        // insert query
        await appDataSource.query(`
        INSERT INTO users
        (email, password)
        VALUES
        ('${email}', '${hash}');`);

        // return message
        return res.status(201).json({"message": "userCreated"});
    } catch (error) {
        console.log(error);
        if (error.errno === 1062) {
            return res.status(400).json({"message": "DUPLICATE_USER_EMAIL"});
        }
        return res.status(error.status).json({"message": error.message});
    }
}

async function login (req, res) {
    try {
        // body parse
        const {email, password} = req.body;
        // input validity
        throwError(!email || !password, 400, "KEY_ERROR");
        
        // duplicate check
        const existingUser = await appDataSource.query(`
        SELECT * 
        FROM users
        WHERE email = '${email}';`);
        throwError(!existingUser.length, 404, "USER_NOT_FOUND");

        // password validation
        const isPasswordValid = await bcrypt.compare(password, existingUser[0].password);
        throwError(!isPasswordValid, 400, "AUTHENTICATION_FAILED");

        // jwt token
        const token = jwt.sign({aud: existingUser[0].id, iat: Date.now()}, process.env.JWT_SECRET);

        return res.status(200).json({"message": "loginSuccess", "token": token});
    } catch (error) {
        console.log(error);
        return res.status(error.status).json({"message": error.message});
    }
}

app.post('/users', createUser);
app.post('/users/login', login);

const start = () => {
    app.listen(port, () => {
        console.log(`App listening on port ${port}`)
      });
};

start();