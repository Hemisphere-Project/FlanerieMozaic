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

// Get the list of videos in a room
export function playlist(room) {
    const roomPath = path.join(process.env.VIDEO_PATH, room);
    if (!fs.existsSync(roomPath)) return [];
    return fs.readdirSync(roomPath).filter(file => 
        fs.lstatSync(path.join(roomPath, file)).isFile()
        && file.split('.').pop() === 'mp4'
    );
}

// Remove a video from a room (and all its re-encoded versions)
export function remove(room, video) 
{
    const roomPath = path.join(process.env.VIDEO_PATH, room);
    const videoPath = path.join(roomPath, video);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    const filename = video.split('.')[0]

    // foreach device in the room
    const devices = fs.readdirSync(roomPath).filter(file => fs.lstatSync(path.join(roomPath, file)).isDirectory());
    devices.forEach(device => {
        const devicePath = path.join(roomPath, device);
        const files = fs.readdirSync(devicePath).filter(file => fs.lstatSync(path.join(devicePath, file)).isFile());
        files.forEach(file => {
            if (file.split('_')[0] === filename) fs.unlinkSync(path.join(devicePath, file));
        })
    });
}




