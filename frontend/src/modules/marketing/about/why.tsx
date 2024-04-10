import { useTranslation } from 'react-i18next';
import DeviceMockup from '~/modules/marketing/device-mockup';

const whyItems = [{ id: 'implementation-ready' }, { id: 'prebuilt-endpoints' }, { id: 'dedicated-community' }];

// Slides for light and dark themes
const lightSlides = [{ src: 'signin-with-cella.png' }, { src: 'app-with-cella.png' }, { src: 'org-page.png' }];
const darkSlides = [{ src: 'dark/signin-with-cella.png' }, { src: 'dark/app-with-cella.png' }];

const Why = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto mb-12 mt-20 flex max-w-[86rem] flex-wrap items-center lg:mb-[60px] relative">
      <div className="w-full lg:w-5/12">
        <div className="flex flex-wrap">
          {whyItems.map((item, index) => {
            const title = `about:why.title_${index + 1}`;
            const text = `about:why.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="group mb-12 flex">
                  <div className="border-primary text-l md:text-1xl mr-6 flex h-[32px] w-full max-w-[32px] items-center justify-center rounded-full border-2 font-semibold group-hover:bg-transparent md:-mt-2 md:h-[48px] md:max-w-[48px]">
                    {index + 1}
                  </div>
                  <div className="w-full">
                    <h3 className="mb-2 text-xl font-medium 2xl:text-[22px]">{t(title)}</h3>
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
