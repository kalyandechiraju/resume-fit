import {Video} from '@remotion/media';
import {AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion';

export const FlowScene = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 16, 82, 100], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#29232a', fontFamily: 'DM Sans', overflow: 'hidden'}}>
      <Video
        muted
        objectFit="contain"
        src={staticFile('resume-fit-flow.mp4')}
        style={{height: '100%', width: '100%'}}
      />
      <div
        style={{
          background: 'linear-gradient(90deg, rgb(41 35 42 / 0.92), rgb(41 35 42 / 0.58))',
          border: '1px solid rgb(255 255 255 / 0.14)',
          borderRadius: 999,
          bottom: 50,
          color: '#fffdf9',
          fontSize: 30,
          fontWeight: 750,
          left: 64,
          letterSpacing: '-0.02em',
          opacity: titleOpacity,
          padding: '18px 28px',
          position: 'absolute',
          transform: `translateY(${interpolate(frame, [0, 24], [28, 0], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}px)`,
        }}
      >
        Compare the job open in Chrome.
      </div>
    </AbsoluteFill>
  );
};
