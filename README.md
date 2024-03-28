## Flanerie

### Requirements
- NodeJS

### Install

```
git clone https://github.com/Hemisphere-Project/Flanerie.git
cd Flanerie
git checkout erasme-24
npm install
```

Also put your media in **www/video/** directory. 

### Run
```
node server.js
```

### Use
**On client devices**
- Device interface: http://<server>:3000/
- To put device in a specific room (or group) use http://<server>:3000/<room-name>

**On control device**
- Control interface: http://<server>:3000/control
- To control a specific room (or group): http://<server>:3000/<room-name>/control

