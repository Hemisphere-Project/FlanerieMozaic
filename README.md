## Flanerie

### Requirements
- NodeJS

### Install

```
git clone https://github.com/Hemisphere-Project/Flanerie.git
cd Flanerie
npm install
```

Also put your media in **www/video/** directory. 

### Run
```
node server.js
```

### Use
**On client devices**
- Device interface: http://[server-ip]:3000
- To put device in a specific room (or group) use http://[server-ip]:3000/[room-name]

**On control device**
- Control interface: http://[server-ip]:3000/control
- To control a specific room (or group): http://[server-ip]:3000/[room-name]/control


# PM2 allow port 80
https://pm2.keymetrics.io/docs/usage/specifics/#listening-on-port-80-w-o-root