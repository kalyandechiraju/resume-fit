import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

const lines = [
  {text: 'Open source.', color: '#29232a'},
  {text: 'Free to try.', color: '#6f294f'},
  {text: 'Bring your own key.', color: '#29232a'},
] as const;

export const FinalScene = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        background: 'radial-gradient(circle at 18% 82%, #f3e3eb 0, transparent 30%), #f5f0e7',
        color: '#29232a',
        display: 'flex',
        fontFamily: 'DM Sans',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div style={{alignItems: 'center', display: 'flex', flexDirection: 'column', textAlign: 'center'}}>
        <Img
          src={staticFile('icon-128.png')}
          style={{
            height: 108,
            opacity: interpolate(frame, [0, 14], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            transform: `scale(${interpolate(frame, [0, 20], [0.72, 1], {
              easing: Easing.out(Easing.back(1.4)),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })})`,
            width: 108,
          }}
        />
        <div style={{display: 'flex', flexDirection: 'column', gap: 16, marginTop: 34}}>
          {lines.map((line, index) => {
            const start = 12 + index * 11;
            return (
              <div
                key={line.text}
                style={{
                  color: line.color,
                  fontFamily: 'Instrument Serif',
                  fontSize: 102,
                  letterSpacing: '-0.052em',
                  lineHeight: 1,
                  opacity: interpolate(frame, [start, start + 14], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  transform: `translateX(${interpolate(frame, [start, start + 22], [index % 2 === 0 ? -100 : 100, 0], {
                    easing: Easing.out(Easing.cubic),
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  })}px)`,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
        <div
          style={{
            backgroundColor: '#6f294f',
            borderRadius: 999,
            boxShadow: '0 18px 45px rgb(82 32 60 / 0.22)',
            color: '#fffdf9',
            fontSize: 27,
            fontWeight: 800,
            marginTop: 50,
            opacity: interpolate(frame, [54, 70], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            padding: '18px 30px',
            transform: `scale(${interpolate(frame, [54, 74], [0.86, 1], {
              easing: Easing.out(Easing.back(1.25)),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })})`,
          }}
        >
          github.com/kalyandechiraju/resume-fit
        </div>
      </div>
    </AbsoluteFill>
  );
};
