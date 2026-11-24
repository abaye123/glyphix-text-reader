import { saveNow } from './lib/store.js'

export default {
  onCreate() {
    console.info('[reader] started')
  },
  onHide() {
    saveNow()
  },
  onDestroy() {
    saveNow()
  }
}
