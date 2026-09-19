import {Composition, Folder} from 'remotion';
import {ResumeFitDemo} from './ResumeFitDemo';
import {FinalScene} from './scenes/FinalScene';
import {FlowScene} from './scenes/FlowScene';
import {ShowcaseScene} from './scenes/ShowcaseScene';

export const Root = () => (
  <>
    <Folder name="Scenes">
      <Composition id="RecordedFlow" component={FlowScene} durationInFrames={999} fps={30} width={1920} height={1080} />
      <Composition id="AllScreens" component={ShowcaseScene} durationInFrames={180} fps={30} width={1920} height={1080} />
      <Composition id="OpenSourceCta" component={FinalScene} durationInFrames={150} fps={30} width={1920} height={1080} />
    </Folder>
    <Composition id="ResumeFitDemo" component={ResumeFitDemo} durationInFrames={1299} fps={30} width={1920} height={1080} />
  </>
);
