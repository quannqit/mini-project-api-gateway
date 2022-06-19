import { graphqlUploadExpress } from 'graphql-upload';
import { ExtractJwt } from 'passport-jwt';

import {
  GraphQLDataSourceProcessOptions,
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
} from '@apollo/gateway';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import {
  MiddlewareConsumer,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtModule, JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    GraphQLModule.forRootAsync<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      imports: [
        JwtModule.registerAsync({
          useFactory: (configService: ConfigService) => ({
            secret: configService.get('SECRET'),
            signOptions: { expiresIn: '2weeks' },
          }),
          inject: [ConfigService],
        }),
      ],
      useFactory: (jwtService: JwtService, configService: ConfigService) => ({
        server: {
          cors: true,
          context: ({ req }) => {
            try {
              if (req.headers.authorization) {
                const extractor = ExtractJwt.fromAuthHeaderAsBearerToken();
                const token = extractor(req);

                const isValid = jwtService.verify(token);
                if (isValid) {
                  // TODO: verify token is not in blocklist

                  const decoded = jwtService.decode(token) as {
                    [key: string]: any;
                  };
                  return {
                    ...decoded,
                    authorization: `${req.headers.authorization}`,
                  };
                }
              }
            } catch (err) {
              console.log(err);
              throw new UnauthorizedException(
                'User unauthorized with invalid authorization Headers',
              );
            }
          },
        },
        gateway: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          buildService: ({ name, url }) => {
            return new RemoteGraphQLDataSource({
              url,
              willSendRequest({
                request: req,
                context,
              }: GraphQLDataSourceProcessOptions<Record<string, any>>) {
                if (context) {
                  req.http.headers.set('user-id', context.id);
                  req.http.headers.set('user-email', context.email);
                  req.http.headers.set('user-created-at', context.createdAt);
                  req.http.headers.set('authorization', context.authorization);
                } else {
                  req.http.headers.delete('user-id');
                  req.http.headers.delete('user-email');
                  req.http.headers.delete('user-created-at');
                  req.http.headers.delete('authorization');
                }
              },
            });
          },
          supergraphSdl: new IntrospectAndCompose({
            subgraphs: [
              {
                name: 'account-services',
                url: configService.get('ACCOUNT_SERVICES_URL'),
              },
              {
                name: 'saving-services',
                url: configService.get('SAVING_SERVICES_URL'),
              },
            ],
          }),
        },
      }),
      inject: [JwtService, ConfigService],
    }),
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(graphqlUploadExpress()).forRoutes('graphql');
  }
}
