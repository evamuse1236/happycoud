/** Explicitly opt-in test material, never presented as Khushi's real comments. */
export function sampleData() {
  const openings=[
    'You make ordinary afternoons feel like a small adventure.',
    'I still laugh every time I remember that absolutely terrible joke.',
    'There is something about your kindness that makes people feel at home.',
    'Some people arrive like sunlight through a window. You are one of them.',
    'The way you notice little things is my favourite thing about you.',
    'This is your reminder that you do not have to earn being loved.',
    'My favourite plot twist was becoming your friend.',
    'Thank you for listening to the story behind the story.',
    'You have made a place in the world that feels a little softer.',
    'Even your chaotic plans somehow turn into beautiful memories.',
    'You kept going. I hope you know how much that matters.',
    'The world needs your particular kind of wonderfully strange.',
    'Somewhere between the laughter and the silence, we found a little home.',
    'Your laugh deserves its own constellation.',
    'I came for the photographs. I stayed for the person behind them.',
    'The coffee got cold because we forgot to stop talking.',
    'You remembered a tiny thing I said months ago. That meant everything.',
    'Keep a little room for wonder. It looks good on you.',
    'The moon has competition tonight, apparently.',
    'The committee has decided: you are not allowed to doubt your outfit.',
    'I love how you turn a perfectly sensible plan into a story worth telling.',
    'If friendship had a sound, it would be us laughing in the kitchen.',
    'May you always find people who make the silence comfortable.',
    'One day you will look back and see how brave you were being.',
    'I thought I was having a bad day. Then your message arrived.',
    'There are whole gardens in the way you care for people.',
    'You are the friend I would call with absolutely no news.',
    'I hope the love you give the world finds its way back to you.',
    'Please never become too grown-up for our ridiculous traditions.',
    'The best part of this picture is knowing the story we cannot tell here.',
    'Your imagination takes the scenic route, and I love that.',
    'I am saving this little moment for a day that needs it.',
    'You said it was a short walk. My legs would like to file a complaint.',
    'Some friendships feel like a place you can return to.',
    'A small light is still a light. Thank you for being one.',
    'तुम्हारी हँसी में एक छोटा-सा आसमान बसता है। 💛'
  ];
  const endings=['',' I still think about that day.',' Here is to all the little things.',' More evenings like that, please.',' Sending a very long-distance hug. 🤍',' This is a memory I am keeping.',' Always cheering for you.',' I hope you can see what we see.',' The little moments are the big ones.',' We have so many stories left to make.'];
  const comments=[];
  for(let i=0;i<360;i++){
    let text=openings[i%openings.length]+endings[Math.floor(i/openings.length)];
    if(i===18)text='Some people are places.\nA doorway left open.\nA lamp in the rain.\nA room where you do not have to explain.';
    const id=`sample-${String(i+1).padStart(3,'0')}`;
    const categories=['poetry','laugh','love','poetry','love','love','love','love','love','laugh','love','laugh','poetry','poetry','love','laugh','love','poetry','poetry','laugh','laugh','love','poetry','love','love','poetry','love','love','laugh','laugh','poetry','love','laugh','love','poetry','poetry'];
    const moods=[categories[i%36]];
    const author=`sample.friend.${String(i%37+1).padStart(2,'0')}`;
    const conversation=i%13===0?[{id:`${id}-reply`,parentId:id,author:'sample.reply',text:'This is an illustrative reply, included to demonstrate a preserved conversation.',isOwner:false}]:[];
    comments.push({id,text,author,moods,conversation,postDate:'',commentUrl:null,postUrl:null,isReply:false,parentId:null});
  }
  return {comments,version:'sample-360-v2',sample:true,provisional:true,notes:'Illustrative test comments, not a real Instagram archive.'};
}
