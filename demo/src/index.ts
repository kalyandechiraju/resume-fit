import {loadFont} from '@remotion/fonts';
import {registerRoot, staticFile} from 'remotion';
import {Root} from './Root';

loadFont({
  family: 'DM Sans',
  url: staticFile('dm-sans-latin.woff2'),
  weight: '100 900',
});

loadFont({
  family: 'Instrument Serif',
  url: staticFile('instrument-serif-latin.woff2'),
  weight: '400',
});

registerRoot(Root);
