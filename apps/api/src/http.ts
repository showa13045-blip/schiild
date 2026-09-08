import {Body,Controller,Get,Post,Patch,Param,Query,Req,UploadedFile,UseInterceptors,Inject,Module,ExceptionFilter,Catch,ArgumentsHost,HttpException} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {NestFactory} from '@nestjs/core';
import type {Request,Response} from 'express';
import type {SchiilId,SchiildId} from '@schiild/shared/types';
import {WebSocketServer,WebSocket} from 'ws';
import {Database} from './database.js';
import {Posting} from './posting.js';
import {Catalog} from './catalog.js';
import {uuid} from './errors.js';
import type {Authenticator,Engine,ObjectStore,Moderator} from './ports.js';
export const API=Symbol('API');
export interface Runtime {db:Database;auth:Authenticator;posting:Posting;catalog:Catalog;changed:(atelierIds:string[])=>Promise<void>}
@Catch()
class Errors implements ExceptionFilter {catch(error:unknown,host:ArgumentsHost){const response=host.switchToHttp().getResponse<Response>();if(error instanceof HttpException)response.status(error.getStatus()).json(error.getResponse());else response.status(503).json({code:'service_unavailable',copyKey:'error.server.title'});}}
@Controller('v1')
class ApiController {
 constructor(@Inject(API) private runtime:Runtime){}
 private user(request:Request){return this.runtime.db.authenticate(request.headers.authorization,this.runtime.auth);}
 @Post('schiils') @UseInterceptors(FileInterceptor('image',{limits:{fileSize:10*1024*1024,files:1}}))
 async post(@Req() request:Request,@UploadedFile() image:{buffer:Buffer}|undefined,@Body() body:Record<string,unknown>){const result=await this.runtime.posting.create(await this.user(request),image?.buffer,body.atelier_ids,body.caption);await this.runtime.changed(result.atelierIds);return result;}
 @Post('schiils/:schiilId/posts') async add(@Req() request:Request,@Param('schiilId') photo:string,@Body() body:Record<string,unknown>){const result=await this.runtime.posting.add(await this.user(request),uuid(photo) as SchiilId,body.atelier_ids);await this.runtime.changed(result.atelierIds);return result;}
 @Get('ateliers') async list(@Req() request:Request){return this.runtime.catalog.ateliers(await this.user(request));}
 @Post('ateliers') async create(@Req() request:Request,@Body() body:Record<string,unknown>){return this.runtime.catalog.create(await this.user(request),body.name,body.capacity);}
 @Post('ateliers/join') async join(@Req() request:Request,@Body() body:Record<string,unknown>){return this.runtime.catalog.join(await this.user(request),body.invite_code);}
 @Get('ateliers/:atelierId/today') async today(@Req() request:Request,@Param('atelierId') atelier:string){return this.runtime.catalog.today(await this.user(request),uuid(atelier));}
 @Patch('ateliers/:atelierId/cover') async cover(@Req() request:Request,@Param('atelierId') atelier:string,@Body() body:Record<string,unknown>){return this.runtime.catalog.cover(await this.user(request),uuid(atelier),body.schiild_id);}
 @Get('ateliers/:atelierId/schiilds') async works(@Req() request:Request,@Param('atelierId') atelier:string,@Query('cursor') cursor:unknown){return this.runtime.catalog.list(await this.user(request),uuid(atelier),cursor);}
 @Get('schiilds/global/:date/my-pixel') async pixel(@Req() request:Request,@Param('date') day:string){return this.runtime.catalog.global(day,await this.user(request));}
 @Get('schiilds/global/:date') async global(@Req() request:Request,@Param('date') day:string){await this.user(request);return this.runtime.catalog.global(day);}
 @Get('schiilds/:schiildId/lottery') async lottery(@Param('schiildId') work:string){return this.runtime.catalog.lottery(uuid(work) as SchiildId);}
 @Get('schiilds/:schiildId') async detail(@Req() request:Request,@Param('schiildId') work:string){await this.user(request);return this.runtime.catalog.detail(uuid(work) as SchiildId);}
 @Post('schiilds/:schiildId/decline') async decline(@Req() request:Request,@Param('schiildId') work:string){return this.runtime.catalog.decline(await this.user(request),uuid(work) as SchiildId);}
 @Get('me/custody') async custody(@Req() request:Request){return this.runtime.catalog.custody(await this.user(request));}
}
export async function createApi(options:{db:Database;auth:Authenticator;store:ObjectStore;moderator:Moderator;engine:Engine;now?:()=>Date}){
 const runtime:Runtime={db:options.db,auth:options.auth,posting:new Posting(options.db,options.store,options.moderator,options.engine,options.now),catalog:new Catalog(options.db,options.engine,options.now),changed:async()=>{}};
 @Module({controllers:[ApiController],providers:[{provide:API,useValue:runtime}]}) class ServerModule{}
 const app=await NestFactory.create(ServerModule,{logger:false});app.useGlobalFilters(new Errors());app.enableShutdownHooks();
 const sockets=new Map<WebSocket,{userId:string;atelierId:string}>();
 const socketServer=new WebSocketServer({server:app.getHttpServer(),maxPayload:8192});
 socketServer.on('connection',(socket,request)=>{
  const match=/^\/v1\/ateliers\/([a-f0-9-]+)\/live$/.exec(request.url??'');if(!match){socket.close(1008);return;}
  const timeout=setTimeout(()=>socket.close(1008),10000);
  socket.once('message',async bytes=>{try{const message=JSON.parse(bytes.toString());const userId=await options.db.authenticate(`Bearer ${message.token}`,options.auth),atelierId=uuid(match[1]);await runtime.catalog.member(userId,atelierId);clearTimeout(timeout);sockets.set(socket,{userId,atelierId});socket.send(JSON.stringify(await runtime.catalog.today(userId,atelierId)));}catch{clearTimeout(timeout);socket.close(1008);}});
  socket.on('close',()=>{clearTimeout(timeout);sockets.delete(socket);});
 });
 const broadcast=async (atelierIds:string[])=>{for(const [socket,subscriber] of sockets){if(atelierIds.includes(subscriber.atelierId)&&socket.readyState===WebSocket.OPEN){try{socket.send(JSON.stringify(await runtime.catalog.today(subscriber.userId,subscriber.atelierId)));}catch{socket.close(1008);}}}};
 const listener=await options.db.pool.connect();
 await listener.query('LISTEN schiild_live');
 listener.on('notification',message=>{try{void broadcast(JSON.parse(message.payload??'[]'));}catch{}});
 return {app,runtime,close:async()=>{await listener.query('UNLISTEN schiild_live');listener.release();for(const socket of socketServer.clients)socket.terminate();await new Promise<void>(r=>socketServer.close(()=>r()));await app.close();}};
}
