            // إضافة شروط البحث
            if (search && search.trim()) {
                const searchTerm = new RegExp(search.trim(), 'i'); // Case insensitive search
                
                if (search_type === 'name') {
                    contactQuery.name = searchTerm;
                } else if (search_type === 'phone') {
                    contactQuery.number = searchTerm;
                } else { // search_type === 'all'
                    // إذا كان عندنا $or في المجموعة، نستخدم $and للجمع بين الشروط
                    if (contactQuery.$or) {
                        contactQuery.$and = [
                            { $or: contactQuery.$or },
                            {
                                $or: [
                                    { name: searchTerm },
                                    { number: searchTerm }
                                ]
                            }
                        ];
                        delete contactQuery.$or; // نمسح $or الأصلي عشان ما يتعارضش مع $and
                    } else {
                        // إذا مكنش عندنا $or، نضع شروط البحث مباشرة
                        contactQuery.$or = [
                            { name: searchTerm },
                            { number: searchTerm }
                        ];
                    }
                }
            }