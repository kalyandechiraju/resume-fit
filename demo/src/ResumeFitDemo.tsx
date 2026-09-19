import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {FinalScene} from './scenes/FinalScene';
import {FlowScene} from './scenes/FlowScene';
import {ShowcaseScene} from './scenes/ShowcaseScene';

export const ResumeFitDemo = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={999} name="Recorded product flow">
      <FlowScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
    <TransitionSeries.Sequence durationInFrames={180} name="All screens">
      <ShowcaseScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
    <TransitionSeries.Sequence durationInFrames={150} name="Open-source CTA">
      <FinalScene />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
