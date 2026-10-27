// Versioned consent applies only to new submissions. It is not a rights attestation to Apple.
export const POSTING_POLICY_VERSION='2026-10-27.2';
export const postingActions=new Set(['post','reuse','global.record']);
export const postingCopy={
 ja:{title:'投稿ルール',agree:'写真の権利と投稿ルールを確認し、作品の生成・表示に同意します。',summary:'自分で撮影し、必要な権利と許可を持つ写真を記録してください。選んだ公開先で共同作品・縮小画像を表示します。元写真は退会時に削除し、共同作品は匿名の記録として残ります。'},
 en:{title:'Posting rules',agree:'I have the necessary rights and agree to the posting rules and use of this photo in shared artworks.',summary:'Only post photos you took and have permission to use. Shared artworks and thumbnails appear in the places you select. Original photos are deleted when you delete your account; shared artworks remain without your account details.'},
 ko:{title:'게시 규칙',agree:'사진에 필요한 권한과 게시 규칙을 확인했으며, 공동 작품 제작과 표시에 동의합니다.',summary:'직접 촬영하고 필요한 권한과 허락을 받은 사진을 기록해 주세요. 선택한 공개 범위에 공동 작품과 축소 이미지가 표시됩니다. 탈퇴 시 원본 사진은 삭제되며 공동 작품은 계정 정보 없이 남습니다.'},
 fr:{title:'Règles de publication',agree:'Je dispose des droits nécessaires et accepte les règles ainsi que l’utilisation de cette photo dans les œuvres collectives.',summary:'Publiez uniquement vos propres photos, avec les autorisations nécessaires. Les œuvres collectives et miniatures sont visibles aux endroits choisis. La suppression du compte efface les originaux ; les œuvres collectives restent sans lien avec votre compte.'},
 nl:{title:'Plaatsingsregels',agree:'Ik heb de nodige rechten en ga akkoord met de regels en het gebruik van deze foto in gezamenlijke werken.',summary:'Plaats alleen zelfgemaakte foto’s waarvoor je de nodige toestemming hebt. Gezamenlijke werken en miniaturen verschijnen op de gekozen plekken. Bij het verwijderen van je account worden originele foto’s gewist; gezamenlijke werken blijven zonder je accountgegevens bestaan.'},
 es:{title:'Normas de publicación',agree:'Tengo los derechos necesarios y acepto las normas y el uso de esta foto en obras compartidas.',summary:'Publica solo fotos propias con los permisos necesarios. Las obras y miniaturas aparecen en los destinos que elijas. Al eliminar tu cuenta se borran las fotos originales; las obras compartidas permanecen sin vincularse a tu cuenta.'},
 it:{title:'Regole di pubblicazione',agree:'Dispongo dei diritti necessari e accetto le regole e l’uso di questa foto nelle opere condivise.',summary:'Pubblica solo foto scattate da te e con le autorizzazioni necessarie. Le opere e le miniature sono visibili nelle destinazioni scelte. Eliminando l’account vengono cancellate le foto originali; le opere condivise restano senza collegamenti al tuo account.'},
 // ISO language code, not a record identifier.
 // eslint-disable-next-line schiild/domain-names
 id:{title:'Aturan unggahan',agree:'Saya memiliki hak yang diperlukan dan menyetujui aturan unggahan serta penggunaan foto ini dalam karya bersama.',summary:'Unggah hanya foto yang Anda ambil sendiri dan telah memperoleh izin yang diperlukan. Karya bersama dan gambar mini tampil di tempat yang Anda pilih. Saat akun dihapus, foto asli dihapus; karya bersama tetap ada tanpa terhubung ke akun Anda.'},
 km:{title:'គោលការណ៍បង្ហោះ',agree:'ខ្ញុំមានសិទ្ធិចាំបាច់ និងយល់ព្រមតាមគោលការណ៍បង្ហោះ ព្រមទាំងការប្រើរូបថតនេះក្នុងស្នាដៃរួម។',summary:'សូមបង្ហោះតែរូបថតដែលអ្នកបានថតផ្ទាល់ និងមានការអនុញ្ញាតចាំបាច់។ ស្នាដៃរួម និងរូបភាពតូចនឹងបង្ហាញនៅកន្លែងដែលអ្នកជ្រើសរើស។ ពេលលុបគណនី រូបថតដើមនឹងត្រូវលុប ប៉ុន្តែស្នាដៃរួមនៅតែមាន ដោយមិនភ្ជាប់ទៅគណនីរបស់អ្នក។'},
 hi:{title:'पोस्ट करने के नियम',agree:'मेरे पास ज़रूरी अधिकार हैं और मैं पोस्ट करने के नियमों तथा साझा कलाकृतियों में इस फ़ोटो के उपयोग से सहमत हूँ।',summary:'केवल अपनी खींची हुई फ़ोटो पोस्ट करें, जिनके लिए ज़रूरी अनुमति आपके पास हो। साझा कलाकृतियाँ और छोटे चित्र आपके चुने हुए स्थानों पर दिखेंगे। खाता मिटाने पर मूल फ़ोटो मिट जाएँगी; साझा कलाकृतियाँ आपके खाते से अलग होकर बनी रहेंगी।'}
};

const reviewNotice={
 ja:'公開前に運営者が元写真を確認します。承認後、記録した日の作品へ反映され、過去の作品が更新される場合もあります。',
 en:'Our team reviews the original photo before publication. Approved photos are added to the artwork for their original date, so past artworks may be updated. ',
 ko:'공개 전에 운영자가 원본 사진을 확인합니다. 승인된 사진은 기록한 날짜의 작품에 반영되므로 과거 작품이 업데이트될 수 있습니다. ',
 fr:'Notre équipe vérifie la photo originale avant publication. Après validation, elle est ajoutée à l’œuvre de sa date d’origine ; les œuvres passées peuvent donc être mises à jour. ',
 nl:'Ons team beoordeelt de originele foto vóór publicatie. Goedgekeurde foto’s worden toegevoegd aan het werk van hun oorspronkelijke datum; eerdere werken kunnen dus veranderen. ',
 es:'Nuestro equipo revisa la foto original antes de publicarla. Tras aprobarse, se añade a la obra de su fecha original, por lo que las obras anteriores pueden actualizarse. ',
 it:'Il nostro team verifica la foto originale prima della pubblicazione. Una volta approvata, viene aggiunta all’opera della data originale; le opere precedenti possono quindi essere aggiornate. ',
 // Language code, not a record identifier.
 // eslint-disable-next-line schiild/domain-names
 id:'Tim kami meninjau foto asli sebelum dipublikasikan. Foto yang disetujui ditambahkan ke karya pada tanggal aslinya, sehingga karya terdahulu dapat diperbarui. ',
 km:'ក្រុមការងារពិនិត្យរូបថតដើមមុនពេលផ្សព្វផ្សាយ។ រូបថតដែលបានអនុម័តនឹងត្រូវបញ្ចូលក្នុងស្នាដៃនៃកាលបរិច្ឆេទដើម ដូច្នេះស្នាដៃកន្លងមកអាចត្រូវបានធ្វើបច្ចុប្បន្នភាព។ ',
 hi:'प्रकाशन से पहले हमारी टीम मूल फ़ोटो की समीक्षा करती है। मंज़ूरी मिलने पर फ़ोटो को उसकी मूल तारीख़ की कलाकृति में जोड़ा जाता है, इसलिए पुरानी कलाकृतियाँ बदल सकती हैं। '
};
for(const language of Object.keys(postingCopy))postingCopy[language].summary=reviewNotice[language]+postingCopy[language].summary;
