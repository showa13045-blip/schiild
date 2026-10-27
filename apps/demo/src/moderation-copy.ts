import {currentLanguage} from './language';
import {moderationCopy} from '../../ios/server/moderation-copy.mjs';
export function moderationText(status:'pending'|'rejected'|'operator'){return moderationCopy[currentLanguage()][status==='pending'?0:status==='rejected'?1:2];}
