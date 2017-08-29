const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio')
const htmllint = require('htmllint');
const stylelint = require('stylelint');
const inlineCss = require('inline-css'); //for css testing

//load the HTML file, since we're gonna need it.
const html = fs.readFileSync('index.html', 'utf-8');
//absolute path for relative loading (if needed)
const baseDir = 'file://'+path.dirname(path.resolve('index.html'))+'/';

describe('Source code is valid', () => {
  test('HTML validates without errors', async () => {
    const lintOpts = {
      'attr-bans':['align', 'background', 'bgcolor', 'border', 'frameborder', 'marginwidth', 'marginheight', 'scrolling', 'style', 'width', 'height'], //adding height, allow longdesc
      'doctype-first':true,
      'doctype-html5':true,
      'html-req-lang':true,
      'line-end-style':false, //either way
      'indent-style':false, //can mix/match
      'indent-width':false, //don't need to beautify
    }

    let htmlValidityObj = await htmllint(html, lintOpts);
    expect(htmlValidityObj).htmlLintResultsContainsNoErrors();    
  })  

  test('CSS validates without errors', async () => {
    let cssValidityObj = await stylelint.lint({files:'css/style.css'});
    expect(cssValidityObj).cssLintResultsContainsNoErrors();
  })
});

describe('Has required HTML', () => {
  let $; //cheerio instance
  beforeAll(() => {
    $ = cheerio.load(html);
  })

  test('Specifies charset', () => {
    expect($('meta[charset]').length).toBe(1);
  })
  
  test('Includes page title', () => {
    let title = $('head > title');
    expect( title.length ).toEqual(1);
    expect( title.text().length).toBeGreaterThan(0);
    expect( title.text() ).not.toEqual("My Page Title");
  })

  test('Includes author metadata', () => {
    let author = $('head > meta[name="author"]')
    expect( author.length ).toEqual(1);
    expect( author.attr('content').length ).toBeGreaterThan(0);
    expect( author.attr('content')).not.toEqual("your name");
  })

  test('Has a top-level heading', () => {
    let h1 = $('h1');
    expect(h1.length).toEqual(1);
    expect(h1.text()).toBeTruthy();
  })

  test('Has an image', () => {
    let img = $('img');
    expect(img.length).toBeGreaterThanOrEqual(1);
    expect(img.attr('src')).toMatch(/img\/*/);
  })

  test('Includes a paragraph', () => {
    let p = $('p');
    expect(p.length).toBeGreaterThanOrEqual(1);
    expect(p.text()).toBeTruthy();
  })

  test('Includes a hyperlink in the paragraph', () => {
    let a = $('p a');
    expect( a.length ).toBeGreaterThanOrEqual(1);
    expect( a.attr('href') ).toMatch(/https?:\/\/*/); //external page
  })

  test('Includes a list', () => {
    expect( $('ul, ol').length ).toBeGreaterThanOrEqual(1);
  })

  test('List has at least 3 items', () => {
    let li = $('ul>li, ol>li');
    expect( li.length ).toBeGreaterThanOrEqual(3);

    //no empty items!
    let empty = li.filter(function(i,elem) { return $(this).text().length == 0; })
    expect( empty.length ).toBe(0);
  })
})

describe('Has required CSS', () => {
  let $; //cheerio instance
  beforeAll(async () => {
    //test CSS by inlining properties and then reading them from cheerio
    let inlined = await inlineCss(html, {url:baseDir, removeLinkTags:false});
    //console.log(inlined);
    $ = cheerio.load(inlined);
  })

  test('Links in local stylesheet', () => {
    let link = $('head > link');
    expect( link.length ).toEqual(1);
    expect( link.attr('href')).toEqual('css/style.css');
  })

  test('Body has default font size', () => {
    expect( $('body').css('font-size') ).toEqual('16px');
  })

  test('Body has default font family', () => {
    let family = ($('body').css('font-family')).replace(/"/g, '\'');
    expect(family).toMatch(/'Helvetica Neue', '?Helvetica'?, '?Arial'?, sans-serif/)
  })

  test('Paragraphs have specified line height', () => {
    let p = $('p')
    expect(p.css('line-height') ).toMatch('1.5');
    expect(p.attr('id')).toBe(undefined); //shouldn't have id or class
    expect(p.attr('class')).toBe(undefined);
  })

  test('Images have constrained height', () => {
    expect( $('img').css('max-height') ).toEqual('400px');
  })

  test('Important list item is colored', () => {
    let li = $('li[class]')
    expect(li.length).toBe(1); //only one item has class
    expect(li.css('color')).toBeDefined();
  });
})

//Custom code validation matchers (for error output)
expect.extend({
  //using htmllint
  htmlLintResultsContainsNoErrors(validityObj) {
    const pass = validityObj.length === 0;
    if(pass){
      return { pass:true, message:() => "expected html to contain validity errors" };  
    }
    else {
      return { pass: false, message:() => (
        //loop through and build the result string
        //these error messages could be more detailed; maybe do manually later
        validityObj.reduce((out, msg)=> {
          return out + `Error: '${msg.rule}' at line ${msg.line}, column ${msg.column}.\n`
        }, '')
      )};      
    }
  },

  //using stylelint errors
  cssLintResultsContainsNoErrors(validityObj) {
    const pass = validityObj.errored === false;
    if(pass){
      return { pass:true, message:() => "expected CSS to contain validity errors" };
    }
    else {
      return { pass: false, message:() => (
        //loop through and build the result string
        JSON.parse(validityObj.output)[0].warnings.reduce((out, msg) => {
          return out + `${msg.severity}: ${msg.text}\n       At line ${msg.line}, column ${msg.column}.\n`
        }, '')
      )};
    }
  }
});