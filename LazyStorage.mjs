import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Store instances by file path
const instances = {};

class LazyStorage {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.saveDelay = options.saveDelay || 1000;
    this.saveTimeout = null;
    this._data = this.load();

    return new Proxy(this._data, {
      get: (target, prop) => {
        if (prop === '_save') return () => this.scheduleSave();
        return target[prop];
      },
      set: (target, prop, value) => {
        target[prop] = value;
        return true;
      }
    });
  }

  load() {
    try {
      console.log("STORE loading from: ", this.filePath)
      const data = readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File does not exist, start with an empty object
        return {};
      }
      console.error(`Error loading JSON from ${this.filePath}:`, error);
      return {};
    }
  }

  save() {
    try {
      // console.log(` = LS: Saving data to ${this.filePath}...`);
      const jsonString = JSON.stringify(this._data, null, 2);
      writeFileSync(this.filePath, jsonString);
      // console.log(` = LS: Successfully saved data to ${this.filePath}`);
      // console.log(` = LS: saved`);
    } catch (error) {
      console.error(` = LS: Error saving JSON to ${this.filePath}:`, error);
    }
  }

  scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(), this.saveDelay);
  }
}

function getLazyStorage(filePath, options = {}) {
  const absolutePath = resolve(filePath);
  if (!instances[absolutePath]) {
    instances[absolutePath] = new LazyStorage(absolutePath, options);
  }
  return instances[absolutePath];
}

export default getLazyStorage;