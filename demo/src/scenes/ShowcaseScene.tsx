import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const screens = [
  {label: 'Add your resume', src: 'screenshot-onboarding.png', rotate: -2.5},
  {label: 'Capture the job', src: 'screenshot-job-ready.png', rotate: 1.5},
  {label: 'Review the fit', src: 'screenshot-results.png', rotate: -1},
] as const;

export const ShowcaseScene = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 84% 18%, #f3e3eb 0, transparent 30%), #f5f0e7',
        color: '#29232a',
        fontFamily: 'DM Sans',
        overflow: 'hidden',
        padding: '54px 112px',
      }}
    >
      <div style={{alignItems: 'baseline', display: 'flex', gap: 28, justifyContent: 'center'}}>
        {['Upload.', 'Capture.', 'Compare.'].map((word, index) => {
          const start = index * 8;
          return (
            <div
              key={word}
              style={{
                color: index === 2 ? '#6f294f' : '#29232a',
                fontFamily: 'Instrument Serif',
                fontSize: 98,
                letterSpacing: '-0.055em',
                lineHeight: 1,
                opacity: interpolate(frame, [start, start + 14], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${interpolate(frame, [start, start + 20], [62, 0], {
                  easing: Easing.out(Easing.cubic),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}px)`,
              }}
            >
              {word}
            </div>
          );
        })}
      </div>

      <div style={{display: 'flex', gap: 54, justifyContent: 'center', marginTop: 52}}>
        {screens.map((screen, index) => {
          const start = 22 + index * 10;
          const progress = interpolate(frame, [start, start + 24], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={screen.src}
              style={{
                backgroundColor: '#fffdf9',
                border: '2px solid #ded5cc',
                borderRadius: 30,
                boxShadow: '0 28px 70px rgb(67 39 55 / 0.18)',
                height: 700,
                opacity: progress,
                overflow: 'hidden',
                position: 'relative',
                transform: `translateY(${(1 - progress) * 90}px) rotate(${screen.rotate * progress}deg)`,
                width: 456,
              }}
            >
              <Img
                src={staticFile(screen.src)}
                style={{
                  height: 700,
                  left: '50%',
                  maxWidth: 'none',
                  position: 'absolute',
                  top: 0,
                  transform: 'translateX(-79%)',
                  width: 1120,
                }}
              />
              <div
                style={{
                  background: 'linear-gradient(transparent, rgb(41 35 42 / 0.9))',
                  bottom: 0,
                  color: '#fffdf9',
                  fontSize: 25,
                  fontWeight: 800,
                  left: 0,
                  padding: '72px 26px 24px',
                  position: 'absolute',
                  right: 0,
                }}
              >
                {screen.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
