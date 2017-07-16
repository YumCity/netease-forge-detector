/**
 * Created by bangbang93 on 2017/7/17.
 */
'use strict';
const request = require('request');
const rp = require('request-promise');
const ora = require('ora');
const ZIP = require('zip');
const mkdirp = require('mkdirp');
const fs = require('mz/fs');
const concat = require('concat-stream');
const Promise = require('bluebird');
const CliTable = require('cli-table');

let p;

const PERCENT = new Map();
async function main() {
  p = ora('计算网易forge').start();
  const NETEASE_MAP = await calcFileObject(await fs.readFile('netease-forge.jar'));
  console.log(`总计${NETEASE_MAP.size}个文件`);
  p.succeed();

  p = ora('拉取forge版本列表').start();
  const forgeVersionList = await rp('http://bmclapi2.bangbang93.com/forge/minecraft/1.8.8', {
    json: true
  });
  p.succeed();
  console.log(`总计${forgeVersionList.length}个版本`);
  await Promise.map(forgeVersionList, async (forge) => {
    // if (!forge.version.startsWith('11.15')) return;
    let p = ora(`下载Forge： ${forge.version}`).start();
    const body = await downloadForge(forge.build);
    p.succeed();
    p.text = `计算Forge： ${forge.version}`;
    const map = await calcFileObject(body);
    p = ora(`对比 ${forge.version}`).start();
    let same = 0;
    for(const [path, res] of map) {
      if (!NETEASE_MAP.has(path)) continue;
      if (NETEASE_MAP.get(path) === res) same ++;
    }
    const percent = same / map.size;
    PERCENT.set(forge.version, {
      percent,
      same,
      size: map.size,
      map,
    });
    p.succeed(`${forge.version},${percent}`)
  });
  const table = [...PERCENT.entries()].sort(([, a],[, b]) => a.percent - b.percent)
    .map(([version, e]) => [version, e.percent, e.same, e.size]);
  const cliTable = new CliTable({
    head: ['版本', '相似度', '相同文件数', '文件总数'],
  });
  table.forEach((e) => cliTable.push(e));
  console.log(cliTable.toString());
  const mostSame = PERCENT.get(table[table.length - 1][0]).map;
  for(const [path, res] of mostSame) {
    if (!NETEASE_MAP.has(path)) {
      console.log(`delete file: ${path}`);
      continue;
    }
    if (NETEASE_MAP.get(path) !== res) {
      console.log(`modify file: ${path}`);
    }
  }
  for(const [path, res] of NETEASE_MAP) {
    if (!mostSame.has(path)){
      console.log(`new file: ${path}`);
    }
  }
}

main().catch((err) => {
  if (p) {
    p.fail();
  }
  console.error(err);
});

function downloadForge(build) {
  return rp(`http://bmclapi2.bangbang93.com/forge/download/universal/${build}`, {
    encoding: null,
  });
}

function calcFileObject(buffer) {
  const map = new Map();
  const zip = ZIP.Reader(buffer);
  zip.forEach((entry) => {
    if (entry.isDirectory()) return;
    map.set(entry.getName(), md5(entry.getData()));
  });
  return map;
}

function md5(buffer) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(buffer).digest('hex');
}