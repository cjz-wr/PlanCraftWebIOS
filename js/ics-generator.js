/**
 * ICS 文件生成器
 * 生成符合 RFC 5545 标准的 iCalendar 文件
 */

const ICSGenerator = {
    /**
     * 生成 ICS 文件
     * @param {Array} courseData - 课程数据数组
     * @param {Date} semesterStart - 学期开始日期（周一）
     * @returns {File} - ICS 文件对象
     */
    generate(courseData, semesterStart) {
        console.log('[ICS Generator] 开始生成 ICS 文件');
        console.log('[ICS Generator] 课程数量:', courseData.length);
        console.log('[ICS Generator] 学期开始日期:', semesterStart);
        
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//ICS Course Import//CN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:课表',
            'X-WR-TIMEZONE:Asia/Shanghai'
        ];
        
        console.log('[ICS Generator] 添加时区定义...');
        
        // 添加时区定义
        lines.push(...this.getTimezoneDefinition());
        
        console.log('[ICS Generator] 开始处理课程数据...');
        
        let totalEvents = 0;
        
        // 添加每个课程事件
        courseData.forEach((course, index) => {
            console.log(`[ICS Generator] 处理课程 ${index + 1}/${courseData.length}:`, {
                name: course.name,
                teacher: course.teacher,
                location: course.location,
                weeks: course.weeks,
                day: course.day,
                period: course.period
            });
            
            const events = this.createCourseEvents(course, semesterStart);
            events.forEach(event => {
                lines.push(...event);
            });
            totalEvents += events.length;
        });
        
        lines.push('END:VCALENDAR');
        
        console.log('[ICS Generator] ICS 文件生成完成');
        console.log('[ICS Generator] 总事件数:', totalEvents);
        console.log('[ICS Generator] 文件行数:', lines.length);
        
        // 创建文件
        const content = lines.join('\r\n');
        console.log('[ICS Generator] 文件大小:', content.length, '字符');
        
        const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
        const file = new File([blob], '课表.ics', { type: 'text/calendar' });
        
        console.log('[ICS Generator] 文件对象创建成功:', file.name, file.size, 'bytes');
        
        return file;
    },

    /**
     * 获取时区定义
     * @returns {Array} - 时区定义行
     */
    getTimezoneDefinition() {
        return [
            'BEGIN:VTIMEZONE',
            'TZID:Asia/Shanghai',
            'BEGIN:STANDARD',
            'DTSTART:19700101T000000',
            'TZOFFSETFROM:+0800',
            'TZOFFSETTO:+0800',
            'TZNAME:CST',
            'END:STANDARD',
            'END:VTIMEZONE'
        ];
    },

    /**
     * 为课程创建日历事件
     * @param {Object} course - 课程对象
     * @param {Date} semesterStart - 学期开始日期
     * @returns {Array} - 事件行数组
     */
    createCourseEvents(course, semesterStart) {
        const events = [];
        const weeks = this.parseWeeks(course.weeks);
        
        console.log(`[ICS Generator] 解析周数:`, course.weeks, '->', weeks);
        
        weeks.forEach(week => {
            const eventDate = this.calculateEventDate(semesterStart, week, course.day);
            // 优先使用学校脚本返回的精确起止时间，缺失时回退到节次表
            const startTime = this.normalizeTime(course.startTime) || this.getPeriodTime(course.period, 'start');
            const endTime = this.normalizeTime(course.endTime) || this.getPeriodTime(course.period, 'end');
            
            console.log(`[ICS Generator] 第${week}周:`, {
                date: this.formatDate(eventDate),
                startTime: startTime,
                endTime: endTime
            });

            const event = [
                'BEGIN:VEVENT',
                `DTSTART;TZID=Asia/Shanghai:${this.formatDate(eventDate)}T${startTime}00`,
                `DTEND;TZID=Asia/Shanghai:${this.formatDate(eventDate)}T${endTime}00`,
                `SUMMARY:${this.escapeText(course.name)}`,
                `LOCATION:${this.escapeText(course.location || '')}`,
                `DESCRIPTION:${this.escapeText(course.teacher || '')}`,
                `UID:${this.generateUID(course, week)}`,
                `DTSTAMP:${this.formatDate(new Date())}T000000Z`,
                'STATUS:CONFIRMED',
                'TRANSP:OPAQUE',
                'END:VEVENT'
            ];

            events.push(event);
        });
        
        console.log(`[ICS Generator] 课程"${course.name}"生成了${events.length}个事件`);

        return events;
    },

    /**
     * 解析周数字符串
     * @param {string|number} weeks - 周数（如 "1-16" 或 [1,2,3]）
     * @returns {Array} - 周数数组
     */
    parseWeeks(weeks) {
        console.log('[ICS Generator] 解析周数:', weeks, '类型:', typeof weeks);
        
        if (Array.isArray(weeks)) {
            console.log('[ICS Generator] 周数是数组:', weeks);
            return weeks;
        }

        if (typeof weeks === 'string') {
            // 处理 "1-16" 格式
            if (weeks.includes('-')) {
                const [start, end] = weeks.split('-').map(Number);
                const result = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                console.log('[ICS Generator] 周数范围格式:', weeks, '->', result);
                return result;
            }

            // 处理 "1,3,5" 格式
            if (weeks.includes(',')) {
                const result = weeks.split(',').map(Number);
                console.log('[ICS Generator] 周数列表格式:', weeks, '->', result);
                return result;
            }

            // 单个数字
            const result = [parseInt(weeks)];
            console.log('[ICS Generator] 单个周数:', weeks, '->', result);
            return result;
        }

        // 如果是数字
        if (typeof weeks === 'number') {
            console.log('[ICS Generator] 数字周数:', weeks);
            return [weeks];
        }

        // 默认返回第1周
        console.warn('[ICS Generator] 无法解析周数，使用默认值 1:', weeks);
        return [1];
    },

    /**
     * 计算事件日期
     * @param {Date} semesterStart - 学期开始日期
     * @param {number} week - 周数
     * @param {number} day - 星期几（1-7）
     * @returns {Date} - 事件日期
     */
    calculateEventDate(semesterStart, week, day) {
        const date = new Date(semesterStart);
        // 加上 (week-1) 周
        date.setDate(date.getDate() + (week - 1) * 7);
        // 加上 (day-1) 天（因为 semesterStart 已经是周一）
        date.setDate(date.getDate() + (day - 1));
        return date;
    },

    /**     * 规范化时间字符串为 HHMM（4 位数字），供 ICS 使用
     * 支持 "08:15"、"8:5"、"0815" 等格式
     * @param {string|number} t - 时间
     * @returns {string} 4 位数字字符串或空字符串
     */
    normalizeTime(t) {
        if (t === undefined || t === null) return '';
        const s = String(t).replace(/[^\d:]/g, '');
        const parts = s.split(':');
        if (parts.length === 2) {
            const hh = String(parts[0]).padStart(2, '0');
            const mm = String(parts[1]).padStart(2, '0');
            return (hh + mm).slice(0, 4);
        }
        return s.replace(/[^\d]/g, '').slice(0, 4);
    },

    /**     * 获取课程节次对应的时间
     * @param {number} period - 节次
     * @param {string} type - 类型（start 或 end）
     * @returns {string} - 时间字符串（HHMMSS）
     */
    getPeriodTime(period, type) {
        // 课程时间表（可根据需要调整）
        const timeTable = {
            1: { start: '0800', end: '0845' },
            2: { start: '0855', end: '0940' },
            3: { start: '1000', end: '1045' },
            4: { start: '1055', end: '1140' },
            5: { start: '1400', end: '1445' },
            6: { start: '1455', end: '1540' },
            7: { start: '1600', end: '1645' },
            8: { start: '1655', end: '1740' },
            9: { start: '1900', end: '1945' },
            10: { start: '1955', end: '2040' }
        };

        const time = timeTable[period];
        if (!time) {
            console.warn(`[ICS Generator] 未知的节次: ${period}，使用默认时间`);
            // 默认时间
            return type === 'start' ? '0800' : '0900';
        }
        
        const result = time[type];
        console.log(`[ICS Generator] 第${period}节 ${type}时间:`, result);
        return result;
    },

    /**
     * 格式化日期为 YYYYMMDD
     * @param {Date} date - 日期对象
     * @returns {string} - 格式化后的日期
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    },

    /**
     * 转义文本中的特殊字符
     * @param {string} text - 原始文本
     * @returns {string} - 转义后的文本
     */
    escapeText(text) {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    },

    /**
     * 生成唯一标识符
     * @param {Object} course - 课程对象
     * @param {number} week - 周数
     * @returns {string} - UID
     */
    generateUID(course, week) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const courseName = course.name.replace(/\s/g, '');
        return `${courseName}-${week}-${timestamp}-${random}@ics-course-import`;
    }
};

// 导出到全局作用域
window.ICSGenerator = ICSGenerator;