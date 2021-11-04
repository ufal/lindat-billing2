FROM node:16


COPY package.json /web/package.json
RUN cd /web; npm install --no-optional --silent

COPY . /web

WORKDIR /web

EXPOSE 3021

CMD npm start
