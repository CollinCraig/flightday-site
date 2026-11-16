#!/usr/bin/env node
// Single packaging entry point for dev, tests, Android and the static /demo build.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// Canonical FE-D3 source. Never edit the runtime copy.
const source=path.join(root,'fixtures/demo-house');
const dest=path.join(root,'web/fixtures/demo-house');
fs.mkdirSync(path.dirname(dest),{recursive:true});fs.rmSync(dest,{recursive:true,force:true});
execFileSync('cp',['-RL',source,dest]);
// Stage A's synthetic HA export is an ops input, not a runtime demo asset.
fs.rmSync(path.join(dest,'stage-a-export'),{recursive:true,force:true});
console.log('Demo fixture copied to web/fixtures/demo-house');

require('./copy-wallpaper-fixture.cjs');
