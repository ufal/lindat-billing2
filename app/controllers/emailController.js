const config = require('config');
const promise = require('bluebird');
const nodemailer = require('nodemailer');
const querystring = require('querystring');
const logger = require('../logger');

const transporter = nodemailer.createTransport(config.mail.smtp);

exports.verifyAccount = (email, fname, lname, code) => {    
    return new promise((resolve, reject) => {
        let activation_link = 'http://localhost:3021/verify-account?'
                        + 'user='  + querystring.escape(email)
                        + '&code=' + querystring.escape(code);
        let mailOptions = {
            from: config.mail.from,
            to: email,
            subject: 'Lindat Billing: Account Verification',
            html: '<div><strong>Thank you for registering for Lindat Billing</strong></div>'
                + '<div style="padding: 20px 0px 5px 0px;">Click on the following link to verify your account:</div>'
                + '<div><a style="font-size: 10px;" href=' + activation_link + '>' + activation_link+ '</a></div>'
                + '<div>&nbsp;</div>'
                + '<div>Regards</div>'
                + '<div>Lindat Billing</div>'
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                logger.error(error);
                reject(error);
            } else {
                logger.log('Message sent: %s', info.messageId);
                resolve({
                    status: "success",
                    message: "mail sent."
                });
            }
        });    
    });
};


exports.verifyEndpoint = (endpoint_id, code) => {    
    return new promise((resolve, reject) => {
        let mailOptions = {
            from: config.mail.from,
            to: email,
            subject: 'Lindat Billing: EndPoint Verification',
            html: '<div><strong>A new EndPoint is successfully added to you account.</strong></div>'
                + '<div>Run the following code from the same IP address to verify the EndPoint:</div>'
                + '<div>&nbsp;</div>'                
                + '<div>'
                
                + '</div>'
                + '<div>&nbsp;</div>'
                + '<div>Regards</div>'
                + '<div>Lindat Billing</div>'
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                logger.error(error);
                reject(error);
            } else {
                logger.log('Message sent: %s', info.messageId);
                resolve({
                    status: "success",
                    message: "mail sent."
                });
            }
        });    
    });
};