// DEMO ONLY. Current membership and the participants of a recorded day differ.
export const participants=(room,day)=>day.members??room.members;
export const memberCount=room=>room.members.filter(Boolean).length;
export function snapshotDays(room){
 // Preserve the old slot-to-participant mapping before any slot is reused.
 for(const day of Object.values(room.days))day.members??=[...room.members];
 return room;
}
