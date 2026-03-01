<div align="center" width="100%">
    <img src="./frontend/public/icon.svg" width="128" alt="" />
</div>

# Homelab

A fancy, easy-to-use and reactive self-hosted docker compose.yaml stack-oriented manager.

[![GitHub Repo stars](https://img.shields.io/github/stars/tyevco/homelab?logo=github&style=flat)](https://github.com/tyevco/homelab) [![GitHub last commit (branch)](https://img.shields.io/github/last-commit/tyevco/homelab/master?logo=github)](https://github.com/tyevco/homelab/commits/master/)

<img src="https://github.com/tyevco/homelab/assets/1336778/26a583e1-ecb1-4a8d-aedf-76157d714ad7" width="900" alt="" />

View Video: https://youtu.be/AWAlOQeNpgU?t=48

## ⭐ Features

- 🧑‍💼 Manage your `compose.yaml` files
  - Create/Edit/Start/Stop/Restart/Delete
  - Update Docker Images
- ⌨️ Interactive Editor for `compose.yaml`
- 🦦 Interactive Web Terminal
- 🕷️ (1.4.0 🆕) Multiple agents support - You can manage multiple stacks from different Docker hosts in one single interface
- 🏪 Convert `docker run ...` commands into `compose.yaml`
- 📙 File based structure - Homelab won't kidnap your compose files, they are stored on your drive as usual. You can interact with them using normal `docker compose` commands

<img src="https://github.com/tyevco/homelab/assets/1336778/cc071864-592e-4909-b73a-343a57494002" width=300 />

- 🚄 Reactive - Everything is just responsive. Progress (Pull/Up/Down) and terminal output are in real-time
- 🐣 Easy-to-use & fancy UI - If you love Uptime Kuma's UI/UX, you will love this one too

![](https://github.com/tyevco/homelab/assets/1336778/89fc1023-b069-42c0-a01c-918c495f1a6a)

## 🔧 How to Install

Requirements:
- [Docker](https://docs.docker.com/engine/install/) 20+ / Podman
- (Podman only) podman-docker (Debian: `apt install podman-docker`)
- OS:
  - Major Linux distros that can run Docker/Podman such as:
     - ✅ Ubuntu
     - ✅ Debian (Bullseye or newer)
     - ✅ Raspbian (Bullseye or newer)
     - ✅ CentOS
     - ✅ Fedora
     - ✅ ArchLinux
  - ❌ Debian/Raspbian Buster or lower is not supported
  - ❌ Windows (Will be supported later)
- Arch: armv7, arm64, amd64 (a.k.a x86_64)

### Basic

- Default Stacks Directory: `/opt/stacks`
- Default Port: 5001

```
# Create directories that store your stacks and stores Homelab's stack
mkdir -p /opt/stacks /opt/homelab
cd /opt/homelab

# Download the compose.yaml
curl https://raw.githubusercontent.com/tyevco/homelab/master/compose.yaml --output compose.yaml

# Start the server
docker compose up -d

# If you are using docker-compose V1 or Podman
# docker-compose up -d
```

Homelab is now running on http://localhost:5001

### Advanced

If you want to store your stacks in another directory, you can generate your compose.yaml file by using the following URL with custom query strings.

```
# Download your compose.yaml
curl "https://homelab.kuma.pet/compose.yaml?port=5001&stacksPath=/opt/stacks" --output compose.yaml
```

- port=`5001`
- stacksPath=`/opt/stacks`

Interactive compose.yaml generator is available on: 
https://homelab.kuma.pet

## How to Update

```bash
cd /opt/homelab
docker compose pull && docker compose up -d
```

## Screenshots

![](https://github.com/tyevco/homelab/assets/1336778/e7ff0222-af2e-405c-b533-4eab04791b40)


![](https://github.com/tyevco/homelab/assets/1336778/7139e88c-77ed-4d45-96e3-00b66d36d871)

![](https://github.com/tyevco/homelab/assets/1336778/f019944c-0e87-405b-a1b8-625b35de1eeb)

![](https://github.com/tyevco/homelab/assets/1336778/a4478d23-b1c4-4991-8768-1a7cad3472e3)


## Motivations

- I have been using Portainer for some time, but for the stack management, I am sometimes not satisfied with it. For example, sometimes when I try to deploy a stack, the loading icon keeps spinning for a few minutes without progress. And sometimes error messages are not clear.
- Try to develop with ES Module + TypeScript

If you love this project, please consider giving it a ⭐.


## 🗣️ Community and Contribution

### Bug Report
https://github.com/tyevco/homelab/issues

### Ask for Help / Discussions
https://github.com/tyevco/homelab/discussions

### Translation
If you want to translate Homelab into your language, please read [Translation Guide](https://github.com/tyevco/homelab/blob/master/frontend/src/lang/README.md)

### Create a Pull Request

Be sure to read the [guide](https://github.com/tyevco/homelab/blob/master/CONTRIBUTING.md), as we don't accept all types of pull requests and don't want to waste your time.

## FAQ

#### Can I manage a single container without `compose.yaml`?

The main objective of Homelab is to try to use the docker `compose.yaml` for everything. If you want to manage a single container, you can just use Portainer or Docker CLI.

#### Can I manage existing stacks?

Yes, you can. However, you need to move your compose file into the stacks directory:

1. Stop your stack
2. Move your compose file into `/opt/stacks/<stackName>/compose.yaml`
3. In Homelab, click the " Scan Stacks Folder" button in the top-right corner's dropdown menu
4. Now you should see your stack in the list

#### Is Homelab a Portainer replacement?

Yes or no. Portainer provides a lot of Docker features. While Homelab is currently only focusing on docker-compose with a better user interface and better user experience.

If you want to manage your container with docker-compose only, the answer may be yes.

If you still need to manage something like docker networks, single containers, the answer may be no.

#### Can I install both Homelab and Portainer?

Yes, you can.

## Others

Homelab is built on top of [Compose V2](https://docs.docker.com/compose/migrate/). `compose.yaml`  also known as `docker-compose.yml`.
