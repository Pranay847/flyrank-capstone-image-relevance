import { openDatabase } from './db.js';
import { SUBJECTS } from './domain.js';

export function seed(db, tenant = 'demo') {
  const addImage = db.prepare('INSERT OR IGNORE INTO images(tenant_id,filename,expected_subject) VALUES(?,?,?)');
  for (const subject of SUBJECTS) for (let i = 1; i <= 9; i++) {
    const suffix = subject === 'white-tailed deer' && i === 9 ? '-uncertain' : '';
    addImage.run(tenant, `${subject.replaceAll(' ', '-')}-${i}${suffix}.jpg`, subject);
  }
  const posts = [
    ['Red fox behavior', 'Field notes about Vulpes vulpes and red fox family life', 'red fox'],
    ['Gray wolf packs', 'Canis lupus pack behavior in winter', 'gray wolf'],
    ['Domestic dog care', 'A guide for a canine companion and dogs at home', 'domestic dog'],
    ['Brown bear habitat', 'Ursus arctos habitat and bear conservation', 'brown bear'],
    ['White-tailed deer', 'Odocoileus migration and deer habitat', 'white-tailed deer'],
    ['Fox ecology', 'Wild fox species in a forest ecosystem', 'red fox'],
    ['Wolf communication', 'How wolves communicate across a pack', 'gray wolf'],
    ['Dog training', 'Positive training for a domestic dog', 'domestic dog'],
    ['Bear hibernation', 'Why brown bears hibernate', 'brown bear'],
    ['Deer conservation', 'Protecting white-tailed deer corridors', 'white-tailed deer']
  ];
  const addPost = db.prepare('INSERT INTO posts(tenant_id,title,body,expected_subject) VALUES(?,?,?,?)');
  if (!db.prepare('SELECT 1 FROM posts WHERE tenant_id=?').get(tenant)) for (const p of posts) addPost.run(tenant, ...p);
  return { images: db.prepare('SELECT COUNT(*) n FROM images WHERE tenant_id=?').get(tenant).n, posts: db.prepare('SELECT COUNT(*) n FROM posts WHERE tenant_id=?').get(tenant).n };
}

if (process.argv[1]?.endsWith('seed.js')) {
  const db = openDatabase(process.env.DATABASE_PATH || './data/image-relevance.db');
  console.log(JSON.stringify(seed(db)));
}
