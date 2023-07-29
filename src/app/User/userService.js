const {logger} = require("../../../config/winston");
const {pool} = require("../../../config/database");
const secret_config = require("../../../config/secret");
const userProvider = require("./userProvider");
const userDao = require("./userDao");
const baseResponse = require("../../../config/baseResponseStatus");
const {response} = require("../../../config/response");
const {errResponse} = require("../../../config/response");

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {connect} = require("http2");

// Service: Create, Update, Delete 비즈니스 로직 처리

exports.generateToken = function (userId) {
    console.log("Generating token for userId:", userId)

    const payload = {
        userId: userId,
    };

    const options = {
        expiresIn: "1d",
    };

    try {
        const token = jwt.sign(payload, secret_config.jwtsecret, options)
        console.log("Token generated:", token)
        return token
    } catch (error) {
        console.log("Error generating token:", error.message)
        throw error
    }
}

exports.createUser = async function (userId, userPw, userNickname, gender, height, weight, birthYear) {
    try {
        // 이메일 중복 확인
        const userIdRows = await userProvider.userIdCheck(userId);
        if (userIdRows.length > 0)
            return errResponse(baseResponse.SIGNUP_REDUNDANT_USERID);

        // 비밀번호 암호화
        const hashedPassword = await crypto
            .createHash("sha512")
            .update(userPw)
            .digest("hex");

        const insertUserInfoParams = [userId, hashedPassword, userNickname, gender, height, weight, birthYear];

        const connection = await pool.getConnection(async (conn) => conn);

        const userIdResult = await userDao.insertUserInfo(connection, insertUserInfoParams);
        console.log(`추가된 회원 : ${userIdResult[0].insertId}`)
        connection.release();
        return response(baseResponse.SUCCESS);


    } catch (err) {
        logger.error(`App - createUser Service error\n: ${err.message}`);
        return errResponse(baseResponse.DB_ERROR);
    }
};


// TODO: After 로그인 인증 방법 (JWT)
exports.postSignIn = async function (userId, userPw) {
    try {
        // 이메일 여부 확인
        const userIdRows = await userProvider.userIdCheck(userId);
        if (userIdRows.length < 1) return errResponse(baseResponse.USER_USERID_NOT_EXIST);

        const selectUserId = userIdRows[0].userId

        // 비밀번호 확인
        const hashedPassword = await crypto
            .createHash("sha512")
            .update(userPw)
            .digest("hex");

        const selectUserPasswordParams = [selectUserId, hashedPassword];
        const passwordRows = await userProvider.passwordCheck(selectUserPasswordParams);

        // Check if the user password exists
        if (!passwordRows || passwordRows.length === 0) {
            return errResponse(baseResponse.SIGNIN_PASSWORD_WRONG);
        }

        // Check if the hashed passwords match
        if (passwordRows[0].userPw !== hashedPassword) {
            // Return error response if the passwords don't match
            return errResponse(baseResponse.SIGNIN_PASSWORD_WRONG);
        }

        // 계정 상태 확인
        const userInfoRows = await userProvider.accountCheck(userId);

        if (userInfoRows[0].status === "INACTIVE") {
            return errResponse(baseResponse.SIGNIN_INACTIVE_ACCOUNT);
        } else if (userInfoRows[0].status === "DELETED") {
            return errResponse(baseResponse.SIGNIN_WITHDRAWAL_ACCOUNT);
        }

        console.log(userInfoRows[0].id) // DB의 userId

        //토큰 생성 Service
        let token;
        if (userInfoRows[0].status === "ACTIVE") {
            token = await jwt.sign(
                {
                    userId: userInfoRows[0].id,
                }, // 토큰의 내용(payload)
                secret_config.jwtsecret, // 비밀키
                {
                    expiresIn: "365d",
                } // 유효 기간 365일
            )
        } else {
            token = null
        }

        
        return response(baseResponse.SUCCESS, {
            isSuccess: true,
            userId: userInfoRows[0].id,
            accessToken: token,
        });

    } catch (err) {
        logger.error(`App - postSignIn Service error\n: ${err.message} \n${JSON.stringify(err)}`);
        return errResponse(baseResponse.DB_ERROR);
    }
};

exports.editUser = async function (userId, userNickname) {
    try {
        console.log(userId)
        const connection = await pool.getConnection(async (conn) => conn);
        const editUserResult = await userDao.updateUserInfo(connection, userId, userNickname)
        connection.release();

        return response(baseResponse.SUCCESS);

    } catch (err) {
        logger.error(`App - editUser Service error\n: ${err.message}`);
        return errResponse(baseResponse.DB_ERROR);
    }
}