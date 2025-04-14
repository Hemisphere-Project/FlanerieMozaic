// Media module

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'child_process';
import 'dotenv/config';
import { exit } from 'process';

if (!'VIDEO_PATH' in process.env) { console.log('VIDEO_PATH not defined in .env'); exit(1); }

// VIDEO_PATH contains a folder for each room.
// In each room there is a list of videos and subfolders for each device
// Each device subfolder contains a list of video re-encoded for the device with a given x,y,w,h specified in the filename
// The original video is stored in the room folder
// The re-encoded videos are stored in the device subfolder
// The re-encoded videos are named as <original_video_name>_<x>_<y>_<w>_<h>.mp4
// The re-encoded videos are created by cropping the original video to the specified x,y,w,h

var MEDIA = {conf: null};

// Get previous media configuration from media.json
MEDIA.load = () => {
    const mediaPath = path.join(process.env.VIDEO_PATH, 'media.json');
    if (!fs.existsSync(mediaPath)) MEDIA.conf = {};
    else MEDIA.conf = JSON.parse(fs.readFileSync(mediaPath));

    // For each folder (room) in VIDEO_PATH, for each file in the folder, 
    // get hash of the file and store it in the MEDIA.conf. 
    // 'filename' subfolder contains the re-encoded videos for the devices
    const rooms = fs.readdirSync(process.env.VIDEO_PATH).filter(file => fs.lstatSync(path.join(process.env.VIDEO_PATH, file)).isDirectory());
    rooms.forEach(room => {
        if (!MEDIA.conf[room]) MEDIA.conf[room] = {};
        if (!MEDIA.conf[room].medias) MEDIA.conf[room].medias = {}
        const roomPath = path.join(process.env.VIDEO_PATH, room);
        
        // For each file in the room, get hash of the file and store it in the MEDIA.conf
        const files = fs.readdirSync(roomPath).filter(file => fs.lstatSync(path.join(roomPath, file)).isFile());
        files.forEach(file => {

            // add file
            const name = file.split('.').slice(0, -1).join('.');
            const filepath = path.join(room, file);
            const filepath_full = path.join(process.env.VIDEO_PATH, filepath);
            const subfolder = path.join(room, name);
            const hash = crypto.createHash('md5').update(fs.readFileSync(filepath_full)).digest('hex');

            if (!MEDIA.conf[room].medias[file]) MEDIA.conf[room].medias[file] = {'hash': hash};
            
            // hash changed -> remove the 'filename' subfolder
            if (MEDIA.conf[room].medias[file].hash !== hash) {
                MEDIA.conf[room].medias[file].hash = hash;
                if (fs.existsSync(subfolder)) fs.rmdirSync(subfolder);
            }
        })

        // Default values 
        for (let room in MEDIA.conf) {
            for (let media in MEDIA.conf[room].medias) {
                let m = MEDIA.conf[room].medias[media];
                if (!m.name)        m.name = media.split('.').slice(0, -1).join('.');
                if (!m.file)        m.file = media;
                if (!m.hash)        m.hash = '';
                if (!m.zoom)        m.zoom = 1.0;
                if (!m.offset)      m.offset = {x: 0, y: 0};
                if (!m.filepath)    m.filepath = path.join(room, m.file);
                if (!m.subfolder)   m.subfolder = path.join(room, m.name);
                if (!m.submedias)   m.submedias = [];
            }
        }

        // For each media in the room, check if the media is in the folder
        for (let media in MEDIA.conf[room].medias) {

            const subfolder = path.join(process.env.VIDEO_PATH, MEDIA.conf[room].medias[media].subfolder);

            // if the media is not in the folder, remove it from the MEDIA.conf
            // and remove the 'filename' subfolder
            if (!files.includes(media)) {
                if (fs.existsSync(subfolder)) fs.rmdirSync(subfolder);
                delete MEDIA.conf[room].medias[media];
                continue
            }

            // media eixsts but the 'filename' subfolder does not exist
            // -> create it
            if (!fs.existsSync(subfolder)) fs.mkdirSync(subfolder);

            // Update sub-media list (list of medias in the 'filename' subfolder)
            const subfiles = fs.readdirSync(subfolder).filter(file => fs.lstatSync(path.join(roomPath, file)).isFile());
            MEDIA.conf[room].medias[media].submedias = [];
            subfiles.forEach(file => {
                MEDIA.conf[room].medias[media].push(file);
            })
        }

    })

    

    MEDIA.save();
    console.log('MEDIA', JSON.stringify(MEDIA.conf, null, 4));
}

MEDIA.save = () => {
    fs.writeFileSync(path.join(process.env.VIDEO_PATH, 'media.json'), JSON.stringify(MEDIA.conf, null, 4));
    // console.log('MEDIA', JSON.stringify(MEDIA.conf, null, 4));
}

// Get the list of videos in a room
MEDIA.medialist = (room) => {
    // const roomPath = path.join(process.env.VIDEO_PATH, room);
    // if (!fs.existsSync(roomPath)) return [];
    // return fs.readdirSync(roomPath).filter(file => 
    //     fs.lstatSync(path.join(roomPath, file)).isFile()
    //     && file.split('.').pop() === 'mp4'
    // );
    if (!MEDIA.conf) MEDIA.load();
    if (!MEDIA.conf[room]) return {}
    if (!MEDIA.conf[room].medias) return {}
    return MEDIA.conf[room].medias;
}


// Configure a given media
MEDIA.configure = function (room, video, key, value) {
    if (!MEDIA.conf[room]) MEDIA.conf[room] = {};
    if (!MEDIA.conf[room].medias) MEDIA.conf[room].medias = {}
    if (!MEDIA.conf[room].medias[video]) MEDIA.conf[room].medias[video] = {};
    MEDIA.conf[room].medias[video][key] = value;
    MEDIA.save();
    return MEDIA.conf[room].medias[video]
}

// Get the configuration of a given media
MEDIA.info = function (room, video) {
    if (!MEDIA.conf[room]) return {};
    if (!MEDIA.conf[room].medias) return {};
    if (!MEDIA.conf[room].medias[video]) return {};
    return MEDIA.conf[room].medias[video];
}

function getMediaManager() {
    if (!MEDIA.conf) MEDIA.load()
    return MEDIA;
}

export default getMediaManager;







