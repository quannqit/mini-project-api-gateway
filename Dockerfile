FROM node:16.13.1 as build

WORKDIR /build

COPY package.json .
COPY yarn.lock .
RUN yarn install

COPY . .
RUN yarn build

### Package stage

FROM node:16.13.1-alpine3.14
WORKDIR /usr/src/app

# Only copy production required files
COPY --from=build /build/dist ./dist

COPY package.json .
COPY yarn.lock .
RUN yarn install --prod


EXPOSE 3000
CMD [ "yarn", "start:prod" ]
