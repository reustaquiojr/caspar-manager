// caspar-manager/server/index.js

/**
 * Backend API + WebSocket para Caspar Manager
 * - REST CRUD completo de inputs/outputs
 * - Comandos PLAY / STOP / LOADBG / ROUTE / CLEAR
 * - WebSocket (Socket.IO) broadcastando eventos em tempo real
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { CasparCG } = require('casparcg-connection');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(cors());
app.use(bodyParser.json());

// ---- util de config
const loadConfig = () => {
  try {
    return fs.existsSync(CONFIG_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG_FILE))
      : { inputs: [], outputs: [] };
  } catch (e) {
    console.error('Erro lendo config.json:', e);
    return { inputs: [], outputs: [] };
  }
};
let config = loadConfig();
const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

// ---- Conexão Caspar
const caspar = new CasparCG({
  host: process.env.CASPAR_HOST || 'localhost',
  port: 5250,
  autoConnect: true,
  autoReconnect: true
});

caspar.on('connected', () => {
  console.log('✅ Conectado ao CasparCG');
  io.emit('caspar', { type: 'connected' });
});
caspar.on('disconnected', () => {
  console.warn('⚠️ Desconectado do CasparCG');
  io.emit('caspar', { type: 'disconnected' });
});

const emitEvent = (type, payload={}) => io.emit('caspar', { type, ...payload });

// ---- Helper wrapper
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch(err) { res.status(500).json({ error: err.message }); }
};

// ---- Playback routes
app.post('/api/play', wrap(async (req,res)=>{
  const { channel, layer, file, loop } = req.body;
  await caspar.play(channel, layer, file, loop ? 'LOOP': '');
  emitEvent('play',{channel,layer,file,loop});
  res.json({success:true});
}));

app.post('/api/stop', wrap(async (req,res)=>{
  const {channel,layer} = req.body;
  await caspar.stop(channel,layer);
  emitEvent('stop',{channel,layer});
  res.json({success:true});
}));

app.post('/api/clear', wrap(async (req,res)=>{
  const {channel}=req.body;
  await caspar.clear(channel);
  emitEvent('clear',{channel});
  res.json({success:true});
}));

app.post('/api/loadbg', wrap(async (req,res)=>{
  const {channel,layer,file,auto}=req.body;
  await caspar.loadbg(channel,layer,file,auto?'AUTO':'');
  emitEvent('loadbg',{channel,layer,file,auto});
  res.json({success:true});
}));

app.post('/api/route', wrap(async (req,res)=>{
  const {channel,layer,source}=req.body;
  const input=config.inputs.find(i=>i.id===source);
  if(!input) return res.status(404).json({error:'Input não encontrado'});
  await caspar.play(channel,layer,`route://${input.id}`);
  emitEvent('route',{channel,layer,source});
  res.json({success:true});
}));

// ---- CRUD Config
app.get('/api/config', (_req,res)=>res.json(config));
app.get('/api/config/inputs', (_req,res)=>res.json(config.inputs));
app.get('/api/config/outputs', (_req,res)=>res.json(config.outputs));

app.post('/api/config/input', wrap(async (req,res)=>{
  const {id,type,source,label,umd}=req.body;
  if(!id||!source) return res.status(400).json({error:'id e source obrigatórios'});
  if(config.inputs.some(i=>i.id===id)) return res.status(409).json({error:'Input existe'});
  config.inputs.push({id,type,source,label,umd});
  saveConfig();
  emitEvent('input:add',{id});
  res.json({success:true});
}));

app.put('/api/config/input/:id', wrap(async (req,res)=>{
  const idx=config.inputs.findIndex(i=>i.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Input não encontrado'});
  config.inputs[idx]={...config.inputs[idx],...req.body};
  saveConfig();
  emitEvent('input:update',{id:req.params.id});
  res.json({success:true,input:config.inputs[idx]});
}));

app.delete('/api/config/input/:id', wrap(async (req,res)=>{
  const len=config.inputs.length;
  config.inputs=config.inputs.filter(i=>i.id!==req.params.id);
  if(config.inputs.length===len) return res.status(404).json({error:'Input não encontrado'});
  saveConfig();
  emitEvent('input:delete',{id:req.params.id});
  res.json({success:true});
}));

// outputs CRUD similar
app.post('/api/config/output', wrap(async (req,res)=>{
  const {id,type,target,label}=req.body;
  if(!id||!target) return res.status(400).json({error:'id e target obrigatórios'});
  if(config.outputs.some(o=>o.id===id)) return res.status(409).json({error:'Output existe'});
  config.outputs.push({id,type,target,label});
  saveConfig();
  emitEvent('output:add',{id});
  res.json({success:true});
}));

app.put('/api/config/output/:id', wrap(async (req,res)=>{
  const idx=config.outputs.findIndex(o=>o.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Output não encontrado'});
  config.outputs[idx]={...config.outputs[idx],...req.body};
  saveConfig();
  emitEvent('output:update',{id:req.params.id});
  res.json({success:true,output:config.outputs[idx]});
}));

app.delete('/api/config/output/:id', wrap(async (req,res)=>{
  const len=config.outputs.length;
  config.outputs=config.outputs.filter(o=>o.id!==req.params.id);
  if(config.outputs.length===len) return res.status(404).json({error:'Output não encontrado'});
  saveConfig();
  emitEvent('output:delete',{id:req.params.id});
  res.json({success:true});
}));

// Health
app.get('/api/health', (_req,res)=>res.json({status:'ok', casparConnected: caspar.connected}));

// ---- WS connection logs
io.on('connection', socket=>{
  console.log('🔌 WS client connected');
  socket.emit('hello',{msg:'Bem‑vindo ao Caspar Manager WS'});
});

server.listen(PORT, ()=>console.log(`🚀 Caspar Manager REST+WS em :${PORT}`));
