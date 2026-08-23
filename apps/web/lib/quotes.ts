/**
 * Lines worth reading twice, from films and series.
 *
 * Hand-curated rather than pulled from an API on purpose. The free quote APIs
 * are famously unreliable on attribution — they routinely credit a line to the
 * actor instead of the character, to the wrong film, or to nobody at all — and
 * a footer that misquotes a well-known film is worse than no footer. Every
 * entry here names the character who says it, the performer, the title and the
 * year, and each one is a line actually spoken on screen.
 *
 * `speaker` is the character; `actor` is who played them. Both are shown,
 * because "Roy Batty" alone means nothing to most people and "Rutger Hauer"
 * alone loses the character.
 */
export interface Quote {
  text: string;
  /** The character who says it. */
  speaker: string;
  /** The performer, shown after the character. */
  actor: string;
  /** Film or series it comes from. */
  title: string;
  /** Release year — first air year for a series. */
  year: string;
  kind: "movie" | "series";
}

export const QUOTES: Quote[] = [
  {
    text: "All those moments will be lost in time, like tears in rain. Time to die.",
    speaker: "Roy Batty",
    actor: "Rutger Hauer",
    title: "Blade Runner",
    year: "1982",
    kind: "movie",
  },
  {
    text: "Get busy living, or get busy dying.",
    speaker: "Andy Dufresne",
    actor: "Tim Robbins",
    title: "The Shawshank Redemption",
    year: "1994",
    kind: "movie",
  },
  {
    text: "Hope is a good thing, maybe the best of things, and no good thing ever dies.",
    speaker: "Andy Dufresne",
    actor: "Tim Robbins",
    title: "The Shawshank Redemption",
    year: "1994",
    kind: "movie",
  },
  {
    text: "You either die a hero, or you live long enough to see yourself become the villain.",
    speaker: "Harvey Dent",
    actor: "Aaron Eckhart",
    title: "The Dark Knight",
    year: "2008",
    kind: "movie",
  },
  {
    text: "What we do in life echoes in eternity.",
    speaker: "Maximus",
    actor: "Russell Crowe",
    title: "Gladiator",
    year: "2000",
    kind: "movie",
  },
  {
    text: "I'm going to make him an offer he can't refuse.",
    speaker: "Vito Corleone",
    actor: "Marlon Brando",
    title: "The Godfather",
    year: "1972",
    kind: "movie",
  },
  {
    text: "Keep your friends close, but your enemies closer.",
    speaker: "Michael Corleone",
    actor: "Al Pacino",
    title: "The Godfather Part II",
    year: "1974",
    kind: "movie",
  },
  {
    text: "There is a difference between knowing the path and walking the path.",
    speaker: "Morpheus",
    actor: "Laurence Fishburne",
    title: "The Matrix",
    year: "1999",
    kind: "movie",
  },
  {
    text: "Do. Or do not. There is no try.",
    speaker: "Yoda",
    actor: "Frank Oz",
    title: "The Empire Strikes Back",
    year: "1980",
    kind: "movie",
  },
  {
    text: "Carpe diem. Seize the day, boys. Make your lives extraordinary.",
    speaker: "John Keating",
    actor: "Robin Williams",
    title: "Dead Poets Society",
    year: "1989",
    kind: "movie",
  },
  {
    text: "There are no two words in the English language more harmful than “good job”.",
    speaker: "Terence Fletcher",
    actor: "J.K. Simmons",
    title: "Whiplash",
    year: "2014",
    kind: "movie",
  },
  {
    text: "Love is the one thing that transcends time and space.",
    speaker: "Dr. Amelia Brand",
    actor: "Anne Hathaway",
    title: "Interstellar",
    year: "2014",
    kind: "movie",
  },
  {
    text: "Once you've met someone you never really forget them. It just takes a while for your memories to return.",
    speaker: "Zeniba",
    actor: "Mari Natsuki",
    title: "Spirited Away",
    year: "2001",
    kind: "movie",
  },
  {
    text: "Yesterday is history, tomorrow is a mystery, but today is a gift. That is why it is called the present.",
    speaker: "Master Oogway",
    actor: "Randall Duk Kim",
    title: "Kung Fu Panda",
    year: "2008",
    kind: "movie",
  },
  {
    text: "The greatest trick the devil ever pulled was convincing the world he didn't exist.",
    speaker: "Roger “Verbal” Kint",
    actor: "Kevin Spacey",
    title: "The Usual Suspects",
    year: "1995",
    kind: "movie",
  },
  {
    text: "I have always depended on the kindness of strangers.",
    speaker: "Blanche DuBois",
    actor: "Vivien Leigh",
    title: "A Streetcar Named Desire",
    year: "1951",
    kind: "movie",
  },
  {
    text: "Here's looking at you, kid.",
    speaker: "Rick Blaine",
    actor: "Humphrey Bogart",
    title: "Casablanca",
    year: "1942",
    kind: "movie",
  },
  {
    text: "Every man dies. Not every man really lives.",
    speaker: "William Wallace",
    actor: "Mel Gibson",
    title: "Braveheart",
    year: "1995",
    kind: "movie",
  },
  {
    text: "It's not who I am underneath, but what I do that defines me.",
    speaker: "Bruce Wayne",
    actor: "Christian Bale",
    title: "Batman Begins",
    year: "2005",
    kind: "movie",
  },
  {
    text: "Good morning, and in case I don't see ya: good afternoon, good evening, and good night.",
    speaker: "Truman Burbank",
    actor: "Jim Carrey",
    title: "The Truman Show",
    year: "1998",
    kind: "movie",
  },
  {
    text: "Everything the light touches is our kingdom. A king's time as ruler rises and falls like the sun.",
    speaker: "Mufasa",
    actor: "James Earl Jones",
    title: "The Lion King",
    year: "1994",
    kind: "movie",
  },
  {
    text: "The first rule of Fight Club is: you do not talk about Fight Club.",
    speaker: "Tyler Durden",
    actor: "Brad Pitt",
    title: "Fight Club",
    year: "1999",
    kind: "movie",
  },
  {
    text: "You can't handle the truth!",
    speaker: "Col. Nathan R. Jessep",
    actor: "Jack Nicholson",
    title: "A Few Good Men",
    year: "1992",
    kind: "movie",
  },
  {
    text: "We all go a little mad sometimes.",
    speaker: "Norman Bates",
    actor: "Anthony Perkins",
    title: "Psycho",
    year: "1960",
    kind: "movie",
  },
  {
    text: "What is the cost of lies? It's not that we'll mistake them for the truth. The real danger is that if we hear enough lies, then we no longer recognise the truth at all.",
    speaker: "Valery Legasov",
    actor: "Jared Harris",
    title: "Chernobyl",
    year: "2019",
    kind: "series",
  },
  {
    text: "I am not in danger, Skyler. I am the danger.",
    speaker: "Walter White",
    actor: "Bryan Cranston",
    title: "Breaking Bad",
    year: "2008",
    kind: "series",
  },
  {
    text: "Chaos isn't a pit. Chaos is a ladder.",
    speaker: "Petyr “Littlefinger” Baelish",
    actor: "Aidan Gillen",
    title: "Game of Thrones",
    year: "2011",
    kind: "series",
  },
  {
    text: "Winter is coming.",
    speaker: "Eddard “Ned” Stark",
    actor: "Sean Bean",
    title: "Game of Thrones",
    year: "2011",
    kind: "series",
  },
  {
    text: "You come at the king, you best not miss.",
    speaker: "Omar Little",
    actor: "Michael K. Williams",
    title: "The Wire",
    year: "2002",
    kind: "series",
  },
  {
    text: "“Remember when” is the lowest form of conversation.",
    speaker: "Tony Soprano",
    actor: "James Gandolfini",
    title: "The Sopranos",
    year: "1999",
    kind: "series",
  },
  {
    text: "People tell you who they are, but we ignore it, because we want them to be who we want them to be.",
    speaker: "Don Draper",
    actor: "Jon Hamm",
    title: "Mad Men",
    year: "2007",
    kind: "series",
  },
  {
    text: "Time is a flat circle. Everything we've ever done or will do, we're gonna do over and over and over again.",
    speaker: "Rust Cohle",
    actor: "Matthew McConaughey",
    title: "True Detective",
    year: "2014",
    kind: "series",
  },
  {
    text: "We're all stories, in the end. Just make it a good one, eh?",
    speaker: "The Eleventh Doctor",
    actor: "Matt Smith",
    title: "Doctor Who",
    year: "2010",
    kind: "series",
  },
];
