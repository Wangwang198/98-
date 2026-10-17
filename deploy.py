#!/usr/bin/env python3
# 部署 play-fight-huocai 到阿里云服务器（paramiko 版）
import os, sys, posixpath, paramiko

HOST, PORT, USER, PWD = '121.41.39.129', 22, 'root', 'Cr@cf123x56'
LOCAL = os.path.dirname(os.path.abspath(__file__))
REMOTE = '/www/wwwroot/play.maozirui.com/webgame/play-fight-huocai'

SKIP = {'.git', '__pycache__', 'node_modules'}
SKIP_EXT = {'.py'}   # 生成脚本不上传

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, PORT, USER, PWD, timeout=20, banner_timeout=20, auth_timeout=20)
    return c

def sftp_mkdirs(sftp, path):
    parts = path.strip('/').split('/')
    cur = ''
    for p in parts:
        cur += '/' + p
        try: sftp.mkdir(cur)
        except Exception: pass

def main():
    cli = connect()
    sftp = cli.open_sftp()
    sftp_mkdirs(sftp, REMOTE)
    n = 0
    for root, dirs, files in os.walk(LOCAL):
        dirs[:] = [d for d in dirs if d not in SKIP]
        rel = os.path.relpath(root, LOCAL).replace('\\', '/')
        for f in files:
            if os.path.splitext(f)[1].lower() in SKIP_EXT: continue
            lp = os.path.join(root, f)
            rp = REMOTE if rel == '.' else REMOTE + '/' + rel
            sftp_mkdirs(sftp, rp)
            sftp.put(lp, rp + '/' + f)
            n += 1
    print(f'uploaded {n} files')

    # 更新索引页（脚本存在才执行）
    link_py = os.path.join(LOCAL, 'deploy_link.py')
    if os.path.exists(link_py):
        script = open(link_py, encoding='utf-8').read()
        sftp.putfo(__import__('io').BytesIO(script.encode('utf-8')), '/tmp/deploy_link.py')
        stdin, stdout, stderr = cli.exec_command('python3 /tmp/deploy_link.py', timeout=30)
        print(stdout.read().decode(), stderr.read().decode())
    cli.close()
    print('DEPLOY DONE')

if __name__ == '__main__':
    main()
