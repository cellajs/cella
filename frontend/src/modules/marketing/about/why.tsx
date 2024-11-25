import { useTranslation } from 'react-i18next';
import DeviceMockup from '~/modules/marketing/device-mockup';

const whyItems = [{ id: 'implementation-ready' }, { id: 'prebuilt-endpoints' }, { id: 'dedicated-community' }];

// Slides for light and dark themes
const lightSlides = [
  { src: '/static/screenshots/signin-with-cella.jpg' },
  { src: '/static/screenshots/onboarding.jpg' },
  { src: '/static/screenshots/org-page.jpg' },
  { src: '/static/screenshots/user-sheet-cella.jpg' },
];
const darkSlides = [
  { src: '/static/screenshots/dark/signin-with-cella.jpg' },
  { src: '/static/screenshots/dark/onboarding.jpg' },
  { src: '/static/screenshots/dark/org-page.jpg' },
  { src: '/static/screenshots/dark/user-sheet-cella.jpg' },
];

const Why = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto mb-12 mt-20 flex max-w-7xl flex-wrap items-center lg:mb-16 relative">
      <div className="w-full lg:w-5/12">
        <div className="flex flex-wrap">
          {whyItems.map((item, index) => {
            const title = `about:why.title_${index + 1}`;
            const text = `about:why.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="group mb-12 flex">
                  <div className="border-primary text-l md:text-1xl mr-6 flex h-8 w-full max-w-8 items-center justify-center rounded-full border-2 font-semibold group-hover:bg-transparent md:-mt-2 md:h-12 md:max-w-12">
                    {index + 1}
                  </div>
                  <div className="w-full">
                    <h3 className="mb-2 text-xl font-medium 2xl:text-[1.38rem]">{t(title)}</h3>
                    <p className="leading-relaxed">{t(text)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-full lg:w-7/12">
        <DeviceMockup className="lg:absolute -top-2 lg:ml-8 lg:w-[54vw]" type="pc" lightSlides={lightSlides} darkSlides={darkSlides} />
      </div>
    </div>
  );
};

export default Why;
