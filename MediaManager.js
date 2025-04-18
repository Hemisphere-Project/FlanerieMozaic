// Media module

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import { execSync } from 'child_process';

var MEDIA_FILE = null
var VIDEO_PATH = null

var MEDIA = {conf: null};

MEDIA.loadroom = (room) => {
    if (!MEDIA_FILE) throw new Error('MEDIA_FILE not set');
    if (!VIDEO_PATH) throw new Error('VIDEO_PATH not set');
    if (!fs.existsSync(VIDEO_PATH)) throw new Error('VIDEO_PATH does not exist: '+VIDEO_PATH);

    if (!MEDIA.conf[room]) MEDIA.conf[room] = {};
    if (!MEDIA.conf[room].medias) MEDIA.conf[room].medias = {}
    const roomPath = path.join(VIDEO_PATH, room);

    // Loading
    console.log('MEDIA: loading', room, 'from', roomPath);
    
    // For each file in the room, get hash of the file and store it in the MEDIA.conf
    const files = fs.readdirSync(roomPath).filter(file => fs.lstatSync(path.join(roomPath, file)).isFile());
    files.forEach(file => {

        // Loading
        console.log('\t+ file', file, 'from', roomPath);

        // add file
        const name = file.split('.').slice(0, -1).join('.');
        const filepath = path.join(room, file);
        const filepath_full = path.join(VIDEO_PATH, filepath);
        const subfolder = path.join(room, name);
        // const hash = crypto.createHash('md5').update(fs.readFileSync(filepath_full)).digest('hex');

        // create hash from date and size
        const stats = fs.statSync(filepath_full);
        const hash = crypto.createHash('md5').update(stats.mtime.toString() + stats.size.toString()).digest('hex');

        if (!MEDIA.conf[room].medias[file]) MEDIA.conf[room].medias[file] = {'hash': hash};
        
        // hash changed -> remove the 'filename' subfolder
        if (MEDIA.conf[room].medias[file].hash !== hash) {
            MEDIA.conf[room].medias[file].hash = hash;
            MEDIA.conf[room].medias[file].resolution = { x: 0, y: 0 };
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
            if (!m.resolution)  m.resolution = {x: 0, y: 0};
            if (!m.filepath)    m.filepath = path.join(room, m.file);
            if (!m.subfolder)   m.subfolder = path.join(room, m.name);
            if (!m.submedias)   m.submedias = [];
        }
    }

    // For each media in the room, check if the media is in the folder
    for (let media in MEDIA.conf[room].medias) {

        const subfolder = path.join(VIDEO_PATH, MEDIA.conf[room].medias[media].subfolder);

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
        const subfiles = fs.readdirSync(subfolder).filter(file => fs.lstatSync(path.join(subfolder,  file)).isFile());
        MEDIA.conf[room].medias[media].submedias = [];
        subfiles.forEach(file => {
            MEDIA.conf[room].medias[media].submedias.push(file);
        })
    }

    // For each media check and detect resolution
    for (let media in MEDIA.conf[room].medias) {
        const filepath = path.join(VIDEO_PATH, MEDIA.conf[room].medias[media].filepath);
        const subfolder = path.join(VIDEO_PATH, MEDIA.conf[room].medias[media].subfolder);
        ffmpeg.ffprobe(filepath, (err, metadata) => {
            if (err) console.log('ffprobe error', err);
            if (metadata && metadata.streams && metadata.streams.length > 0) {
                MEDIA.conf[room].medias[media].resolution.x = metadata.streams[0].width;
                MEDIA.conf[room].medias[media].resolution.y = metadata.streams[0].height;
            }
        });
    }
}


// Get previous media configuration from media.json
MEDIA.load = () => {
    console.log()
    if (!MEDIA_FILE) throw new Error('MEDIA_FILE not set');
    if (!VIDEO_PATH) throw new Error('VIDEO_PATH not set');
    if (!fs.existsSync(VIDEO_PATH)) throw new Error('VIDEO_PATH does not exist: '+VIDEO_PATH);

    if (!fs.existsSync(MEDIA_FILE)) MEDIA.conf = {};
    else MEDIA.conf = JSON.parse(fs.readFileSync(MEDIA_FILE));

    // For each folder (room) in VIDEO_PATH, for each file in the folder, 
    // get hash of the file and store it in the MEDIA.conf. 
    // 'filename' subfolder contains the re-encoded videos for the devices
    const rooms = fs.readdirSync(VIDEO_PATH).filter(file => fs.lstatSync(path.join(VIDEO_PATH, file)).isDirectory());
    rooms.forEach(room => { MEDIA.loadroom(room); })
    MEDIA.save();
    // console.log('MEDIA', JSON.stringify(MEDIA.conf, null, 4));
}

MEDIA.addRoom = (room) => {
    if (!MEDIA_FILE) throw new Error('MEDIA_FILE not set');
    if (!VIDEO_PATH) throw new Error('VIDEO_PATH not set');
    if (!fs.existsSync(VIDEO_PATH)) throw new Error('VIDEO_PATH does not exist: '+VIDEO_PATH);

    // create folder
    const roomPath = path.join(VIDEO_PATH, room);
    if (!fs.existsSync(roomPath)) fs.mkdirSync(roomPath);

    MEDIA.loadroom(room);
    MEDIA.save();
}


MEDIA.save = () => {
    if (!MEDIA_FILE) throw new Error('MEDIA_FILE not set');
    fs.writeFileSync(MEDIA_FILE, JSON.stringify(MEDIA.conf, null, 4));
    // console.log('MEDIA', JSON.stringify(MEDIA.conf, null, 4));
}

// Get the list of videos in a room
MEDIA.medialist = (room) => {
    // const roomPath = path.join(VIDEO_PATH, room);
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
MEDIA.configure = function (media, key, value) {
    let room = media.split('/')[0];
    let video = media.split('/')[1];
    if (!room || !video) return {};
    if (!MEDIA.conf[room]) MEDIA.conf[room] = {};
    if (!MEDIA.conf[room].medias) MEDIA.conf[room].medias = {}
    if (!MEDIA.conf[room].medias[video]) MEDIA.conf[room].medias[video] = {};
    MEDIA.conf[room].medias[video][key] = value;

    // Media conf changed: destroy submedias folder and recreate
    const subfolder = path.join(VIDEO_PATH, MEDIA.conf[room].medias[video].subfolder);
    if (fs.existsSync(subfolder)) fs.rmdirSync(subfolder, {recursive: true});
    fs.mkdirSync(subfolder);
    MEDIA.conf[room].medias[video].submedias = [];

    MEDIA.save();
    return MEDIA.conf[room].medias[video]
}

// Device configuration changed: remove all submedia with the device uuid in that room
MEDIA.devicechanged = function (uuid, room) {
    let didchange = false;
    for (let m in MEDIA.conf[room].medias) {
        const media = MEDIA.conf[room].medias[m];
        const submedia = path.join(VIDEO_PATH, media.subfolder, uuid + '.mp4');
        if (fs.existsSync(submedia)) {
            fs.unlinkSync(submedia);
            didchange = true;
        }
        media.submedias = media.submedias.filter((s) => { return s !== uuid + '.mp4'; });
    }
    MEDIA.save();
    return didchange
}


// Get the configuration of a given media
MEDIA.info = function (path) {
    let room = path.split('/')[0];
    let video = path.split('/')[1];
    if (!room || !video) return {};
    if (!MEDIA.conf[room]) return {};
    if (!MEDIA.conf[room].medias) return {};
    if (!MEDIA.conf[room].medias[video]) return {};
    return MEDIA.conf[room].medias[video];
}

MEDIA.unsnap = function (device, media) {
    media = MEDIA.info(media);

    if (!media || !media.filepath) return
    if (!device || !device.uuid) return

    const subfolder = path.join(VIDEO_PATH, media.subfolder);
    const submedia = path.join(subfolder, device.uuid + '.mp4');

    // Delete the submedia if it exists
    if (fs.existsSync(submedia)) fs.unlinkSync(submedia);
    media.submedias = media.submedias.filter((s) => { return s !== device.uuid + '.mp4'; });
    MEDIA.save();
}

// Generate the submedia for a given device / media
MEDIA.snap = function(device, media) {
    media = MEDIA.info(media);

    console.log('device =', device);
    console.log('media =', media);

    return new Promise((resolve, reject) => {
        if (!media || !media.filepath) return reject('Media not found');
        if (!device || !device.uuid) return reject('Device not found');

        const subfolder = path.join(VIDEO_PATH, media.subfolder);
        const submedia = path.join(subfolder, device.uuid + '.mp4');
        const filepath = path.join(VIDEO_PATH, media.filepath);

        // Delete the submedia if it exists
        if (fs.existsSync(submedia)) fs.unlinkSync(submedia);

        // Create the submedia using ffmpeg

        // Device
        const Dw = device.resolution.x;
        const Dh = device.resolution.y;
        const Dx = -1*device.position.x || 0;
        const Dy = -1*device.position.y || 0;
        const Dz = device.zoomdevice || 1.0;

        // Media 
        const Mw = media.resolution.x;
        const Mh = media.resolution.y;
        const Mx = -1*media.offset.x || 0;
        const My = -1*media.offset.y || 0;
        const Mz = media.zoom || 1.0;
        
        // Zoom
        const zoom = Dz*Mz;

        // Target snap size 
        const snapW = Math.round(Dw / zoom);
        const snapH = Math.round(Dh / zoom);

        // Target snap position
        const snapX = Math.round( (Dx+Mx*Dz) / zoom );
        const snapY = Math.round( (Dy+My*Dz) / zoom );

        // Padding (off media area of snap)
        const padLeft = Math.max(0, -1 * snapX);
        const padRight = Math.max(0, snapX + snapW - Mw);
        const padTop = Math.max(0, -1 * snapY);
        const padBottom = Math.max(0, snapY + snapH - Mh);

        // Crop size (media area of snap)
        const cropW = Math.max(0, snapW - padLeft - padRight);
        const cropH = Math.max(0, snapH - padTop - padBottom);

        // Crop position (media area of snap)
        const cropX = Math.max(0, snapX);
        const cropY = Math.max(0, snapY);

        // Find the smallest standard resolution that fits the snap [240p, 360p, 480p, 720p, 1080p]
        const resolutions = [[426, 240], [640, 360], [854, 480], [1280, 720]];
        var standardW = 1920;
        var standardH = 1080;
        for (let i = 0; i < resolutions.length; i++) {
            if (resolutions[i][0] >= snapW && resolutions[i][1] >= snapH) {
                standardW = resolutions[i][0];
                standardH = resolutions[i][1];
                break;
            }
        }
        console.log('snap', snapW, snapH, 'standard', standardW, standardH);

        // Build simplified FFmpeg command
        const cmd = `ffmpeg -i "${filepath}" \
                        -vf "crop=${cropW}:${cropH}:${cropX}:${cropY},pad=${standardW}:${standardH}:${padLeft}:${padTop}:black" \
                        -c:v libx264 -profile:v baseline -level 3.0 -preset slow -crf 18 -x264-params bframes=0 -movflags +faststart -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 \
                        "${submedia}"`;

        // rescale finale video to 640x480
        // const cmd = `ffmpeg -i "${filepath}" \
        //                 -vf "crop=${cropW}:${cropH}:${cropX}:${cropY},pad=${snapW}:${snapH}:${padLeft}:${padTop}:black" \
        //                 -vf "scale=320:240" \
        //                 -c:v libx264 -profile:v baseline -level 3.0 -preset slow -crf 20 -x264-params bframes=0 -movflags +faststart -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 \
        //                 "${submedia}"`;

        // Execute the command sync
        try {
            execSync(cmd, {stdio: 'inherit'});
            console.log('\nsubmedia generated!', submedia, '\n')

            // Push into submedias list
            if (!media.submedias) media.submedias = [];
            media.submedias.push(path.basename(submedia));
            MEDIA.save();
            
            resolve();
        }
        catch (err) {
            console.log('Error generating submedia', err);
            reject(err);
        }
        
    })

}

function getMediaManager(mediafile, videopath) {

    if (mediafile) MEDIA_FILE = path.resolve(mediafile);
    if (videopath) VIDEO_PATH = path.resolve(videopath);

    if (!MEDIA.conf) MEDIA.load()
    return MEDIA;
}

export default getMediaManager;







