// All people, places and documents in this collection are original fiction.
export const archive = {
  id: 'bellwether', title: 'The light at Bellwether', person: 'Nora Vale',
  subtitle: 'Six things left behind. One light that never went out.',
  description: 'When the Bellwether post office closed, someone found a box beneath the sorting desk. Inside: a letter, a photograph, a few ordinary things. And a question nobody thought to ask.',
  years: '1968 — 1997', fictional: true,
  fragments: [
    { id: 'F01', kind: 'letter', title: 'A letter never sent', date: '1987-10-31', displayDate: '31 OCT 1987', from: 'Nora → Elsie', note: 'Folded twice. No stamp. Found in the bottom drawer.', text: 'Dear Elsie,\n\nYou asked why I still leave the sorting-room lamp on after closing. Your father used to look for it from the last ferry. After he died, I thought I would switch it off.\n\nBut then the night nurse waved from the road. And the boy who cleans the cinema began walking this way.\n\nI am not waiting for someone to come back. I want someone to know they can.\n\nLove,\nMum' },
    { id: 'F02', kind: 'photograph', title: 'The sorting-room window', date: '1968-11-04', displayDate: '04 NOV 1968', from: 'Handwritten on the reverse', note: 'A description and transcription, not an original photograph.', text: 'A black-and-white photograph of Bellwether post office at dusk. A small lamp glows in the left window. Two bicycles lean against the wall.\n\nOn the reverse, in blue ink: "Opening week. Arthur says the lamp makes the whole place look like it is expecting somebody. — Nora, 4 November 1968."' },
    { id: 'F03', kind: 'receipt', title: 'Two bulbs. Every autumn.', date: '1991-10-28', displayDate: '28 OCT 1991', from: 'Bellwether Hardware', note: 'A narrow receipt, with a note in the margin.', text: 'BELLWETHER HARDWARE\n28 October 1991\n\n2 × 40W warm light bulbs — £1.80\n1 × packet of envelopes — £0.65\nPaid in cash: N. Vale\n\nMargin note by shopkeeper: "Same two bulbs every autumn. One for the window, one in reserve. Mrs Vale says a promise should have a spare."' },
    { id: 'F04', kind: 'transcript', title: 'Message after the last ferry', date: '1994-02-16', displayDate: '16 FEB 1994', from: 'Answering machine · Elsie', note: 'A fictional transcript. No audio recording is included.', text: '[Answering machine transcript, 16 February 1994, 22:14]\n\nElsie: Mum, it is me. The ferry is late again. Keep the light on? I know you will.\n\n[Pause]\n\nI brought Daniel. He wants to see the place where all the letters sleep.\n\n[Message ends]' },
    { id: 'F05', kind: 'note', title: 'The closing-day notice', date: '1997-10-30', displayDate: '30 OCT 1997', from: 'Bellwether Parish Council', note: 'Pinned to the public noticeboard on the final week.', text: 'BELLWETHER POST OFFICE\nFinal day of service: 31 October 1997.\n\nAfter twenty-nine years, Nora Vale is retiring. The sorting room will become a community reading room.\n\nThe council has agreed to one condition from Mrs Vale: the lamp in the left window is to remain lit until the last ferry arrives.\n\nA key will be held by the night librarian.' },
    { id: 'F06', kind: 'postcard', title: 'A small thank-you', date: '1997-11-02', displayDate: '02 NOV 1997', from: 'Ruth → Nora', note: 'Delivered by hand two days after the office closed.', text: 'Nora,\n\nYou will not remember this. In the winter of 1989, after my first night shift at the hospital, I missed the bus. I walked home in the dark and saw your window.\n\nI took the long way past it every night after that.\n\nI never came in. I just needed to know someone was awake.\n\nThank you for the light.\nRuth' }
  ]
};

export const tourQuestions = [
  'Why did Nora leave the light on?',
  'What happened to the post office?',
  'Who was Arthur?',
  'What was Nora’s favourite song?'
];

export const tourReadings = [
  { title: 'A light for whoever needed it', reading: 'The lamp began as a signal for Elsie’s father, returning on the last ferry. Nora kept it burning after his death, but her unsent letter gives it a wider meaning: a welcome for anyone making their way through the dark. Years later, Ruth’s postcard records what that small act meant to one stranger.', evidence: [
    { sourceId: 'F01', quote: 'I am not waiting for someone to come back. I want someone to know they can.' },
    { sourceId: 'F06', quote: 'I never came in. I just needed to know someone was awake.' }
  ], uncertainty: 'These fragments show Nora’s words and Ruth’s account. They cannot tell us how everyone in Bellwether felt.' },
  { title: 'The letters left. The light stayed.', reading: 'The office closed on 31 October 1997, when Nora retired after twenty-nine years. The sorting room was to become a community reading room. Nora’s condition carried the ritual forward: keep the lamp lit until the last ferry, with the key held by the night librarian.', evidence: [
    { sourceId: 'F05', quote: 'The sorting room will become a community reading room.' },
    { sourceId: 'F05', quote: 'the lamp in the left window is to remain lit until the last ferry arrives.' }
  ], uncertainty: 'The notice records an agreement. The archive does not prove how long the reading room kept it.' },
  { title: 'A name on the back of a photograph', reading: 'Arthur appears in the note on the 1968 photograph. Nora’s later letter mentions Elsie’s father looking for the lamp from the last ferry, and says he died. These fragments suggest a connection, but do not explicitly name Elsie’s father as Arthur.', evidence: [
    { sourceId: 'F02', quote: 'Arthur says the lamp makes the whole place look like it is expecting somebody.' },
    { sourceId: 'F01', quote: 'Your father used to look for it from the last ferry. After he died, I thought I would switch it off.' }
  ], uncertainty: 'Arthur’s full identity and the date or cause of his death are not established here.' },
  { title: 'Some things are still quiet', reading: 'There is no favourite song in this archive. A convincing guess would still be a guess. Add a letter, a playlist, or someone’s recorded recollection if you want to preserve that part of the story.', evidence: [], uncertainty: 'None of the six fragments names a song or describes Nora’s musical taste.' }
];
