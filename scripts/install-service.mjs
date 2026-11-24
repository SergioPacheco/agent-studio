import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
const root=resolve('.');if(/[\n\r%"\\]/.test(root+process.execPath))throw new Error('Caminho incompatível com o serviço.');
const dir=join(homedir(),'.config','systemd','user');await mkdir(dir,{recursive:true});
await writeFile(join(dir,'agent-studio.service'),`[Unit]\nDescription=Agent Studio\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=${root}\nExecStart="${process.execPath}" --env-file-if-exists="${root}/.env" "${root}/server.mjs"\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`);
console.log('Serviço criado. Execute: systemctl --user daemon-reload && systemctl --user enable --now agent-studio');
