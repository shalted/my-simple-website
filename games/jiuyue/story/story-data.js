(function (global) {
  'use strict';

  const opening = Object.freeze({
    id: 'opening',
    title: '月饼不见了！',
    frames: Object.freeze([
      Object.freeze({
        id: 'opening-workshop',
        image: 'story/opening-01-mooncake-workshop.png',
        speaker: '霜尾',
        line: '最后一炉也快好啦！今晚，要让大家都吃到圆圆的月饼。',
        motion: 'drift-right',
        bubble: 'upper-right',
        ariaLabel: '霜尾与追风、桂团、沧澜、赤轮、曜瞳一起制作中秋月饼。'
      }),
      Object.freeze({
        id: 'opening-theft',
        image: 'story/opening-02-theft.png',
        speaker: '追风',
        line: '等等——年兽带着小妖，把月饼全搬走了！',
        motion: 'push-in',
        bubble: 'upper-right',
        ariaLabel: '年兽、护饼卫、运饼小妖和掷饼小妖趁伙伴们不注意偷走月饼。'
      }),
      Object.freeze({
        id: 'opening-clue',
        image: 'story/opening-03-clue.png',
        speaker: '霜尾',
        line: '月饼屑一路通向山那边。伙伴们，我们把大家的月饼追回来！',
        motion: 'drift-left',
        bubble: 'upper-right',
        ariaLabel: '霜尾发现月饼屑和红丝带留下的线索，五位伙伴在身后集合。'
      }),
      Object.freeze({
        id: 'opening-departure',
        image: 'story/opening-04-departure.png',
        speaker: '伙伴们',
        line: '出发！月亮升到最高以前，一定来得及！',
        motion: 'rise',
        bubble: 'upper-center',
        ariaLabel: '霜尾带领五位伙伴踏上追回月饼的旅程。'
      })
    ])
  });

  const ending = Object.freeze({
    id: 'ending',
    title: '月圆，饼也圆',
    frames: Object.freeze([
      Object.freeze({
        id: 'ending-recovered',
        image: 'story/ending-01-recovered.png',
        speaker: '霜尾',
        line: '找回来啦！一块都没有少。',
        motion: 'push-in',
        bubble: 'upper-left',
        ariaLabel: '六位伙伴追回装满月饼的竹篮，年兽和三类小怪停下脚步。'
      }),
      Object.freeze({
        id: 'ending-apology',
        image: 'story/ending-02-apology.png',
        speaker: '年兽',
        line: '对不起……我们闻见香味，一时糊涂。以后再也不拿别人的东西了。',
        motion: 'drift-right',
        bubble: 'upper-center',
        ariaLabel: '年兽与护饼卫、运饼小妖、掷饼小妖低头认错，霜尾伸手邀请。'
      }),
      Object.freeze({
        id: 'ending-feast',
        image: 'story/ending-03-feast.png',
        speaker: '霜尾',
        line: '知错就好。别站着啦，月饼要大家一起吃才更甜！',
        motion: 'drift-left',
        bubble: 'upper-center',
        ariaLabel: '六位伙伴与年兽和三类小怪围坐在桂花树下共同分享月饼。'
      }),
      Object.freeze({
        id: 'ending-finale',
        image: 'story/ending-04-finale.png',
        speaker: '全员',
        line: '中秋快乐！愿每一次团圆，都有温暖相伴。',
        motion: 'rise',
        bubble: 'lower-center',
        celebration: true,
        ariaLabel: '霜尾、追风、桂团、沧澜、赤轮、曜瞳、年兽、护饼卫、运饼小妖和掷饼小妖全员同框庆祝中秋。'
      })
    ])
  });

  global.LionStoryData = Object.freeze({ opening, ending });
})(typeof window!=='undefined'?window:globalThis);
