use std::sync::Mutex;
static SEED: Mutex<[u8; 32]> = Mutex::new([0; 32]);
static OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());
#[no_mangle]
pub extern "C" fn set_seed(index: u32, value: u32) {
    if index < 32 {
        SEED.lock().unwrap()[index as usize] = value as u8;
    }
}
#[no_mangle]
pub extern "C" fn layout(capacity: u32, size: u32, variance: f64) -> u32 {
    let result = crate::bsp(*SEED.lock().unwrap(), capacity as usize, size, variance);
    let mut output = OUTPUT.lock().unwrap();
    match result {
        Ok(rects) => {
            *output = serde_json::to_vec(&rects).unwrap();
            output.as_ptr() as u32
        }
        Err(_) => {
            output.clear();
            0
        }
    }
}
#[no_mangle]
pub extern "C" fn output_len() -> u32 {
    OUTPUT.lock().unwrap().len() as u32
}
